import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config";
import type { AuditEvent, Contract, EmailLogEntry, StaffUser, TemplateVersion } from "../types";
import { hashPassword, verifyPassword } from "../auth/password";
import { ImmutableContractError, POST_SIGNATURE_MUTABLE, type ContractFilter, type ContractPatch, type Store } from "./types";

type DemoStaff = StaffUser & { passwordHash: string };

interface DemoData {
  version: 1;
  staff: DemoStaff[];
  templates: TemplateVersion[];
  contracts: Contract[];
  audit: AuditEvent[];
  emails: EmailLogEntry[];
  webhooks: string[];
  refSeq: number;
}

const empty = (): DemoData => ({ version: 1, staff: [], templates: [], contracts: [], audit: [], emails: [], webhooks: [], refSeq: 0 });

/**
 * Local JSON-file store used in demo mode (no Supabase configured). Suitable for trying the
 * app on one machine; not for production use.
 */
export class DemoStore implements Store {
  readonly kind = "demo" as const;
  private dir = config.demoDataDir;
  private file = path.join(config.demoDataDir, "demo-db.json");
  private data: DemoData | null = null;
  private lock: Promise<unknown> = Promise.resolve();

  private loadedMtime = "";

  // Next.js may load this module more than once (separate bundles for pages and route
  // handlers), so the file is the source of truth: reload whenever it changed on disk.
  private async load(): Promise<DemoData> {
    let mtime = "none";
    try {
      const st = await fs.stat(this.file);
      mtime = `${st.mtimeMs}:${st.size}`;
    } catch {}
    if (this.data && mtime === this.loadedMtime) return this.data;
    try {
      this.data = JSON.parse(await fs.readFile(this.file, "utf8")) as DemoData;
    } catch {
      this.data = empty();
    }
    this.loadedMtime = mtime;
    return this.data;
  }

  private async save() {
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    await fs.rename(tmp, this.file);
    const st = await fs.stat(this.file);
    this.loadedMtime = `${st.mtimeMs}:${st.size}`;
  }

  /** Serialises read-modify-write cycles. */
  private mutate<T>(fn: (d: DemoData) => T | Promise<T>): Promise<T> {
    const run = this.lock.then(async () => {
      const d = await this.load();
      const result = await fn(d);
      await this.save();
      return result;
    });
    this.lock = run.catch(() => undefined);
    return run;
  }

  async isEmpty() {
    return (await this.load()).staff.length === 0;
  }

  // ---- staff ----
  private strip(s: DemoStaff): StaffUser {
    const { passwordHash: _ph, ...rest } = s;
    void _ph;
    return rest;
  }
  async getStaffById(id: string) {
    const s = (await this.load()).staff.find((x) => x.id === id);
    return s ? this.strip(s) : null;
  }
  async listStaff() {
    return (await this.load()).staff.map((s) => this.strip(s)).sort((a, b) => a.fullName.localeCompare(b.fullName));
  }
  async createStaff(input: { email: string; fullName: string; role: StaffUser["role"]; password: string }) {
    const passwordHash = await hashPassword(input.password);
    return this.mutate((d) => {
      const email = input.email.toLowerCase();
      if (d.staff.some((s) => s.email === email)) throw new Error("A staff account with this email already exists.");
      const s: DemoStaff = { id: randomUUID(), email, fullName: input.fullName, role: input.role, active: true, createdAt: new Date().toISOString(), passwordHash };
      d.staff.push(s);
      return this.strip(s);
    });
  }
  async updateStaff(id: string, patch: { fullName?: string; role?: StaffUser["role"]; active?: boolean }) {
    return this.mutate((d) => {
      const s = d.staff.find((x) => x.id === id);
      if (!s) throw new Error("Staff member not found");
      Object.assign(s, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
      return this.strip(s);
    });
  }
  async setStaffPassword(id: string, password: string) {
    const passwordHash = await hashPassword(password);
    await this.mutate((d) => {
      const s = d.staff.find((x) => x.id === id);
      if (!s) throw new Error("Staff member not found");
      s.passwordHash = passwordHash;
    });
  }
  /** Demo-mode credential check. */
  async verifyCredentials(email: string, password: string): Promise<StaffUser | null> {
    const s = (await this.load()).staff.find((x) => x.email === email.toLowerCase());
    // Always run a hash comparison so response time doesn't reveal whether the account exists.
    const ok = await verifyPassword(password, s?.passwordHash ?? "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    return s && ok ? this.strip(s) : null;
  }

  // ---- templates ----
  async getActiveTemplate() {
    return (await this.load()).templates.find((t) => t.isActive) ?? null;
  }
  async getTemplateVersion(id: string) {
    return (await this.load()).templates.find((t) => t.id === id) ?? null;
  }
  async listTemplateVersions() {
    return [...(await this.load()).templates].sort((a, b) => b.version - a.version);
  }
  async createTemplateVersion(input: { title: string; body: string; notes: string | null; createdBy: string; bodySha256: string; isSample?: boolean }) {
    return this.mutate((d) => {
      const version = Math.max(0, ...d.templates.map((t) => t.version)) + 1;
      const t: TemplateVersion = {
        id: randomUUID(), version, title: input.title, body: input.body, notes: input.notes, bodySha256: input.bodySha256,
        isActive: false, isSample: !!input.isSample, createdBy: input.createdBy, createdAt: new Date().toISOString(),
      };
      d.templates.push(t);
      return t;
    });
  }
  async activateTemplateVersion(id: string) {
    await this.mutate((d) => {
      if (!d.templates.some((t) => t.id === id)) throw new Error("Template version not found");
      for (const t of d.templates) t.isActive = t.id === id;
    });
  }

  // ---- contracts ----
  async nextReference() {
    return this.mutate((d) => `TEC-${new Date().getUTCFullYear()}-${String(++d.refSeq).padStart(4, "0")}`);
  }
  private decorate(d: DemoData, c: Contract): Contract {
    return {
      ...c,
      createdByName: d.staff.find((s) => s.id === c.createdBy)?.fullName,
      templateVersion: d.templates.find((t) => t.id === c.templateVersionId)?.version,
    };
  }
  async insertContract(data: Omit<Contract, "id" | "createdAt" | "updatedAt">) {
    return this.mutate((d) => {
      const now = new Date().toISOString();
      const c: Contract = { ...data, id: randomUUID(), createdAt: now, updatedAt: now };
      delete c.createdByName;
      delete c.templateVersion;
      d.contracts.push(c);
      return this.decorate(d, c);
    });
  }
  async getContract(id: string) {
    const d = await this.load();
    const c = d.contracts.find((x) => x.id === id);
    return c ? this.decorate(d, c) : null;
  }
  async listContracts(filter: ContractFilter) {
    const d = await this.load();
    const q = filter.q?.trim().toLowerCase();
    return d.contracts
      .filter((c) => !filter.createdBy || c.createdBy === filter.createdBy)
      .filter((c) => !filter.status || c.status === filter.status)
      .filter((c) => !q || c.customerName.toLowerCase().includes(q) || c.customerEmail.toLowerCase().includes(q) || c.reference.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, filter.limit ?? 200)
      .map((c) => this.decorate(d, c));
  }
  async updateContract(id: string, patch: ContractPatch) {
    return this.mutate((d) => {
      const c = d.contracts.find((x) => x.id === id);
      if (!c) throw new Error("Contract not found");
      if (c.status === "signed") {
        const illegal = Object.keys(patch).filter((k) => !POST_SIGNATURE_MUTABLE.includes(k as keyof ContractPatch));
        const overwritesDoc = c.signedDocumentPath && patch.signedDocumentPath && patch.signedDocumentPath !== c.signedDocumentPath;
        if (illegal.length || overwritesDoc) throw new ImmutableContractError();
      }
      Object.assign(c, patch, { updatedAt: new Date().toISOString() });
      return this.decorate(d, c);
    });
  }
  async deleteDraft(id: string) {
    await this.mutate((d) => {
      const c = d.contracts.find((x) => x.id === id);
      if (!c) return;
      if (c.status !== "draft") throw new Error("Only drafts can be deleted");
      d.contracts = d.contracts.filter((x) => x.id !== id);
    });
  }
  async anonymiseContract(id: string) {
    await this.mutate((d) => {
      const c = d.contracts.find((x) => x.id === id);
      if (!c) return;
      Object.assign(c, {
        customerName: "[erased]", customerEmail: "erased@invalid", customerPhone: "[erased]", fieldValues: {},
        paymentSchedule: null, providerData: null, documentPath: null, signedDocumentPath: null,
        anonymisedAt: new Date().toISOString(),
      });
    });
  }

  // ---- logs ----
  async addAuditEvent(e: Omit<AuditEvent, "id" | "createdAt">) {
    await this.mutate((d) => {
      d.audit.push({ ...e, id: randomUUID(), createdAt: new Date().toISOString() });
    });
  }
  async listAuditEvents(filter: { contractId?: string; contractCreatedBy?: string; limit?: number }) {
    const d = await this.load();
    const own = filter.contractCreatedBy ? new Set(d.contracts.filter((c) => c.createdBy === filter.contractCreatedBy).map((c) => c.id)) : null;
    return d.audit
      .filter((e) => !filter.contractId || e.contractId === filter.contractId)
      .filter((e) => !own || (e.contractId && own.has(e.contractId)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, filter.limit ?? 500);
  }
  async addEmailLog(e: Omit<EmailLogEntry, "id" | "createdAt">) {
    await this.mutate((d) => {
      d.emails.push({ ...e, id: randomUUID(), createdAt: new Date().toISOString() });
    });
  }
  async listEmailLog(filter: { contractId?: string; limit?: number }) {
    const d = await this.load();
    return d.emails
      .filter((e) => !filter.contractId || e.contractId === filter.contractId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, filter.limit ?? 200);
  }
  async claimWebhookEvent(key: string) {
    return this.mutate((d) => {
      if (d.webhooks.includes(key)) return false;
      d.webhooks.push(key);
      return true;
    });
  }

  // ---- files ----
  private filePath(p: string) {
    const safe = path.normalize(p).replace(/^(\.\.(\/|\\|$))+/, "");
    if (safe.includes("..")) throw new Error("Invalid path");
    return path.join(this.dir, "files", safe);
  }
  async putFile(p: string, bytes: Uint8Array) {
    const full = this.filePath(p);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, bytes, { flag: "wx" }); // never overwrite an existing document
  }
  async getFile(p: string) {
    try {
      return new Uint8Array(await fs.readFile(this.filePath(p)));
    } catch {
      return null;
    }
  }
  async deleteFile(p: string) {
    await fs.rm(this.filePath(p), { force: true });
  }
}
