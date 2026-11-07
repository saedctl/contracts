import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import type { AuditEvent, Contract, EmailLogEntry, StaffRole, StaffUser, TemplateVersion } from "../types";
import { ImmutableContractError, type ContractFilter, type ContractPatch, type Store } from "./types";
import { UserFacingError } from "../errors";

const BUCKET = "contracts";

type Row = Record<string, unknown>;

const toCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function camelRow<T>(row: Row): T {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v])) as T;
}
function snakeRow(obj: Row): Row {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined).map(([k, v]) => [toSnake(k), v]));
}

function mapStaff(row: Row): StaffUser {
  return { id: row.id as string, email: row.email as string, fullName: row.full_name as string, role: row.role as StaffRole, active: row.active as boolean, createdAt: row.created_at as string };
}

function mapContract(row: Row): Contract {
  const { creator, template, ...rest } = row as Row & { creator?: { full_name: string } | null; template?: { version: number } | null };
  const c = camelRow<Contract>(rest);
  c.amountPaid = Number(c.amountPaid);
  c.outstandingBalance = Number(c.outstandingBalance);
  c.createdByName = creator?.full_name;
  c.balanceDueDate = c.balanceDueDate ?? null;
  c.balanceCollectedAt = c.balanceCollectedAt ?? null;
  c.balanceCollectedBy = c.balanceCollectedBy ?? null;
  c.instalments = Array.isArray(c.instalments) ? c.instalments : [];
  c.amountPaidOn = c.fieldValues?._amount_paid_on ?? null;
  c.templateVersion = template?.version;
  return c;
}

const CONTRACT_SELECT = "*, creator:profiles!contracts_created_by_fkey(full_name), template:template_versions(version)";

/**
 * When the app is deployed ahead of the database, name the migration that fixes it instead of
 * failing with a generic error. Shown to staff (the message contains no data).
 */
function migrationHint(message: string): string | null {
  if (/balance_(due_date|collected)|instalments|admin_delete_contract/.test(message)) return "0003_payments.sql";
  if (/create_template_version|activate_template_version|app_settings|p_tier|column .*tier|tier.* does not exist/.test(message)) return "0002_settings.sql";
  if (/"end_date".*not-null|null value in column "end_date"/.test(message)) return "0004_lifetime.sql";
  return null;
}

function check<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    if (res.error.message.includes("immutable")) throw new ImmutableContractError();
    const migration = migrationHint(res.error.message);
    if (migration) {
      console.error(`Database is missing migration ${migration}: ${res.error.message}`);
      throw new UserFacingError(
        `The database needs an update before this works. In Supabase, open SQL Editor, paste in supabase/migrations/${migration} from the repository and click Run, then try again.`,
      );
    }
    throw new Error(`Database error: ${res.error.message}`);
  }
  return res.data as T;
}

export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  private db: SupabaseClient;

  constructor() {
    const s = config.supabase!;
    // Service-role client: bypasses RLS, so every caller must authorise first (see lib/auth).
    this.db = createClient(s.url, s.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  get admin() {
    return this.db;
  }

  // ---- staff ----
  async getStaffById(id: string) {
    const row = check(await this.db.from("profiles").select("*").eq("id", id).maybeSingle());
    return row ? mapStaff(row) : null;
  }
  async listStaff() {
    return check(await this.db.from("profiles").select("*").order("full_name")).map(mapStaff);
  }
  async createStaff(input: { email: string; fullName: string; role: StaffRole; password: string }) {
    const { data, error } = await this.db.auth.admin.createUser({
      email: input.email, password: input.password, email_confirm: true, user_metadata: { full_name: input.fullName },
    });
    if (error || !data.user) throw new Error(error?.message.includes("already") ? "A staff account with this email already exists." : `Could not create user: ${error?.message}`);
    const res = await this.db.from("profiles").insert({ id: data.user.id, email: input.email.toLowerCase(), full_name: input.fullName, role: input.role }).select().single();
    if (res.error) {
      await this.db.auth.admin.deleteUser(data.user.id);
      throw new Error(`Could not create profile: ${res.error.message}`);
    }
    return mapStaff(res.data);
  }
  async updateStaff(id: string, patch: { fullName?: string; role?: StaffRole; active?: boolean }) {
    const row = check<Row>(await this.db.from("profiles").update(snakeRow(patch)).eq("id", id).select().single());
    if (patch.active !== undefined) {
      // Deactivated staff are also banned in Supabase Auth so existing sessions can't refresh.
      await this.db.auth.admin.updateUserById(id, { ban_duration: patch.active ? "none" : "876000h" });
    }
    return mapStaff(row);
  }
  async setStaffPassword(id: string, password: string) {
    const { error } = await this.db.auth.admin.updateUserById(id, { password });
    if (error) throw new Error(error.message);
  }

  // ---- templates ----
  private mapTemplate(row: Row): TemplateVersion {
    const t = camelRow<TemplateVersion>(row);
    return { ...t, tier: t.tier ?? null };
  }
  async getActiveTemplates() {
    return check(await this.db.from("template_versions").select("*").eq("is_active", true)).map((r) => this.mapTemplate(r));
  }
  async getTemplateVersion(id: string) {
    const row = check(await this.db.from("template_versions").select("*").eq("id", id).maybeSingle());
    return row ? this.mapTemplate(row) : null;
  }
  async listTemplateVersions() {
    return check(await this.db.from("template_versions").select("*").order("version", { ascending: false })).map((r) => this.mapTemplate(r));
  }
  async createTemplateVersion(input: { title: string; body: string; notes: string | null; createdBy: string; bodySha256: string; tier: TemplateVersion["tier"] }) {
    const row = check(
      await this.db.rpc("create_template_version", {
        p_title: input.title, p_body: input.body, p_notes: input.notes, p_created_by: input.createdBy, p_body_sha256: input.bodySha256, p_tier: input.tier,
      }).single(),
    );
    return this.mapTemplate(row as unknown as Row);
  }
  async activateTemplateVersion(id: string) {
    check(await this.db.rpc("activate_template_version", { p_id: id }));
  }

  // ---- contracts ----
  async nextReference() {
    return check(await this.db.rpc("next_contract_reference")) as string;
  }
  async insertContract(data: Omit<Contract, "id" | "createdAt" | "updatedAt">) {
    const { createdByName: _n, templateVersion: _v, ...rest } = data;
    void _n; void _v;
    // Leave unset payment columns out so contracts can still be created before migration 0003.
    for (const k of ["balanceDueDate", "balanceCollectedAt", "balanceCollectedBy"] as const) if (rest[k] == null) delete rest[k];
    if (Array.isArray(rest.instalments) && rest.instalments.length === 0) delete (rest as Partial<typeof rest>).instalments;
    return mapContract(check(await this.db.from("contracts").insert(snakeRow(rest as Row)).select(CONTRACT_SELECT).single()));
  }
  async getContract(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const row = check(await this.db.from("contracts").select(CONTRACT_SELECT).eq("id", id).maybeSingle());
    return row ? mapContract(row) : null;
  }
  async listContracts(filter: ContractFilter) {
    let query = this.db.from("contracts").select(CONTRACT_SELECT).order("created_at", { ascending: false }).limit(filter.limit ?? 200);
    if (filter.createdBy) query = query.eq("created_by", filter.createdBy);
    if (filter.status) query = query.eq("status", filter.status);
    const q = filter.q?.replace(/[,()%*\\:."']/g, " ").trim();
    if (q) query = query.or(`customer_name.ilike.%${q}%,customer_email.ilike.%${q}%,reference.ilike.%${q}%`);
    return check(await query).map(mapContract);
  }
  async updateContract(id: string, patch: ContractPatch) {
    // Immutability of signed contracts is enforced by a database trigger (see migrations).
    return mapContract(check(await this.db.from("contracts").update(snakeRow(patch as Row)).eq("id", id).select(CONTRACT_SELECT).single()));
  }
  async deleteDraft(id: string) {
    check(await this.db.from("contracts").delete().eq("id", id).eq("status", "draft"));
  }
  async adminDeleteContract(id: string) {
    check(await this.db.rpc("admin_delete_contract", { p_id: id }));
  }
  async anonymiseContract(id: string) {
    check(await this.db.rpc("anonymise_contract", { p_id: id }));
  }

  // ---- logs ----
  async addAuditEvent(e: Omit<AuditEvent, "id" | "createdAt">) {
    check(await this.db.from("audit_events").insert(snakeRow(e as unknown as Row)));
  }
  async listAuditEvents(filter: { contractId?: string; contractCreatedBy?: string; limit?: number }) {
    let query = this.db
      .from("audit_events")
      .select(filter.contractCreatedBy ? "*, contract:contracts!inner(created_by)" : "*")
      .order("created_at", { ascending: false })
      .limit(filter.limit ?? 500);
    if (filter.contractId) query = query.eq("contract_id", filter.contractId);
    if (filter.contractCreatedBy) query = query.eq("contract.created_by", filter.contractCreatedBy);
    return (check(await query) as unknown as Row[]).map((r) => {
      const { contract: _c, ...rest } = r;
      void _c;
      return camelRow<AuditEvent>(rest);
    });
  }
  async addEmailLog(e: Omit<EmailLogEntry, "id" | "createdAt">) {
    check(await this.db.from("email_log").insert(snakeRow(e as unknown as Row)));
  }
  async listEmailLog(filter: { contractId?: string; limit?: number }) {
    let query = this.db.from("email_log").select("*").order("created_at", { ascending: false }).limit(filter.limit ?? 200);
    if (filter.contractId) query = query.eq("contract_id", filter.contractId);
    return check(await query).map((r) => camelRow<EmailLogEntry>(r));
  }
  async getSetting<T>(key: string) {
    const res = await this.db.from("app_settings").select("value").eq("key", key).maybeSingle();
    if (res.error) {
      // Table missing (migration 0002 not run yet): behave as if nothing is configured.
      console.warn(`app_settings unavailable: ${res.error.message}`);
      return null;
    }
    return (res.data?.value as T | undefined) ?? null;
  }
  async setSetting(key: string, value: unknown) {
    const res = await this.db.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
    if (res.error) {
      check(res);
    }
  }
  async claimWebhookEvent(key: string, provider: string, eventType: string, payload: unknown) {
    const res = await this.db.from("webhook_events").insert({ event_key: key, provider, event_type: eventType, payload });
    if (res.error?.code === "23505") return false;
    check(res);
    return true;
  }

  // ---- files ----
  async putFile(path: string, bytes: Uint8Array, contentType: string) {
    const { error } = await this.db.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
    if (error) {
      // The bucket only accepted PDFs before migration 0002, so signature images were rejected.
      if (/mime type|not supported|invalid_mime_type/i.test(error.message) && contentType.startsWith("image/")) {
        throw new UserFacingError(
          "The database needs an update before images can be uploaded. In Supabase, open SQL Editor, paste in supabase/apply-updates.sql from the repository and click Run, then try again.",
        );
      }
      throw new Error(`Storage upload failed: ${error.message}`);
    }
  }
  async getFile(path: string) {
    const { data, error } = await this.db.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  }
  async deleteFile(path: string) {
    await this.db.storage.from(BUCKET).remove([path]);
  }
}
