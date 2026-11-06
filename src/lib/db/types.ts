import type { AuditEvent, Contract, ContractStatus, EmailLogEntry, MembershipTier, NewContract, StaffRole, StaffUser, TemplateVersion } from "../types";

export interface ContractFilter {
  /** Restrict to contracts created by this staff member (sales reps). */
  createdBy?: string;
  q?: string;
  status?: ContractStatus;
  limit?: number;
}

export type ContractPatch = Partial<Omit<Contract, "id" | "reference" | "createdAt" | "createdBy" | "createdByName" | "templateVersion">>;

export interface Store {
  readonly kind: "supabase" | "demo";

  // Staff
  getStaffById(id: string): Promise<StaffUser | null>;
  listStaff(): Promise<StaffUser[]>;
  createStaff(input: { email: string; fullName: string; role: StaffRole; password: string }): Promise<StaffUser>;
  updateStaff(id: string, patch: { fullName?: string; role?: StaffRole; active?: boolean }): Promise<StaffUser>;
  setStaffPassword(id: string, password: string): Promise<void>;

  // Templates (versions are append-only). One version is active per tier (null = all tiers).
  getActiveTemplates(): Promise<TemplateVersion[]>;
  getTemplateVersion(id: string): Promise<TemplateVersion | null>;
  listTemplateVersions(): Promise<TemplateVersion[]>;
  createTemplateVersion(input: { title: string; body: string; notes: string | null; createdBy: string; bodySha256: string; tier: MembershipTier | null }): Promise<TemplateVersion>;
  /** Makes this version the active one for its tier. */
  activateTemplateVersion(id: string): Promise<void>;

  // Contracts
  nextReference(): Promise<string>;
  insertContract(data: NewContract & { reference: string }): Promise<Contract>;
  getContract(id: string): Promise<Contract | null>;
  listContracts(filter: ContractFilter): Promise<Contract[]>;
  updateContract(id: string, patch: ContractPatch): Promise<Contract>;
  deleteDraft(id: string): Promise<void>;
  /** Deletes a contract of any status. Callers must have checked the user is an administrator. */
  adminDeleteContract(id: string): Promise<void>;
  /** Irreversibly removes personal data from a contract past its retention period. */
  anonymiseContract(id: string): Promise<void>;

  // Audit & email logs (append-only)
  addAuditEvent(e: Omit<AuditEvent, "id" | "createdAt">): Promise<void>;
  listAuditEvents(filter: { contractId?: string; contractCreatedBy?: string; limit?: number }): Promise<AuditEvent[]>;
  addEmailLog(e: Omit<EmailLogEntry, "id" | "createdAt">): Promise<void>;
  listEmailLog(filter: { contractId?: string; limit?: number }): Promise<EmailLogEntry[]>;

  // App settings (small JSON values, e.g. the company signature)
  getSetting<T>(key: string): Promise<T | null>;
  setSetting(key: string, value: unknown): Promise<void>;

  /** Records a webhook delivery; returns false if it was already processed (idempotency). */
  claimWebhookEvent(key: string, provider: string, eventType: string, payload: unknown): Promise<boolean>;

  // Private document storage
  putFile(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  getFile(path: string): Promise<Uint8Array | null>;
  deleteFile(path: string): Promise<void>;
}

export class ImmutableContractError extends Error {
  constructor() {
    super("Signed contracts are immutable and cannot be changed.");
  }
}

/** Fields that may still change after a contract is signed (finalisation bookkeeping only). */
export const POST_SIGNATURE_MUTABLE: (keyof ContractPatch)[] = [
  "confirmationSentAt",
  "signedDocumentPath",
  "signedDocumentSha256",
  "providerData",
  "updatedAt",
  // Payment bookkeeping, not contract terms.
  "balanceCollectedAt",
  "balanceCollectedBy",
];
