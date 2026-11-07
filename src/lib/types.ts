export const CONTRACT_STATUSES = ["draft", "sent", "viewed", "signed", "declined", "expired"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const STAFF_ROLES = ["admin", "sales"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const CURRENCIES = ["GBP", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const PAYMENT_STATUSES = ["paid_in_full", "deposit_paid", "payment_plan"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid_in_full: "Paid in Full",
  deposit_paid: "Deposit Paid",
  payment_plan: "Payment Plan",
};

export const MEMBERSHIP_TIERS = ["premium", "vip"] as const;
export type MembershipTier = (typeof MEMBERSHIP_TIERS)[number];
export const MEMBERSHIP_TIER_LABELS: Record<MembershipTier, string> = { premium: "Premium", vip: "VIP" };

/** One scheduled payment of the outstanding balance. Amount and due date are contract terms. */
export interface Instalment {
  id: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  collectedAt: string | null;
  collectedBy: string | null;
}

export type EsignProvider = "dropbox_sign" | "demo";

export interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
}

export interface TemplateVersion {
  id: string;
  version: number;
  /** Tier this template is for; null = used for any tier without its own template. */
  tier: MembershipTier | null;
  title: string;
  body: string;
  notes: string | null;
  bodySha256: string;
  isActive: boolean;
  isSample: boolean;
  createdBy: string | null;
  createdAt: string;
}

/** Values inserted into the template. Formatted strings, frozen when the contract is generated. */
export type FieldValues = Record<string, string>;

export interface Contract {
  id: string;
  reference: string;
  createdBy: string;
  createdByName?: string;
  status: ContractStatus;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  durationMonths: number | null;
  durationLabel: string;
  startDate: string; // YYYY-MM-DD
  /** YYYY-MM-DD; null for a lifetime membership. */
  endDate: string | null;
  amountPaid: number;
  /**
   * YYYY-MM-DD the amount paid was received (may be before the contract date). Derived from
   * fieldValues._amount_paid_on; null for older contracts (use the contract date).
   */
  amountPaidOn: string | null;
  currency: Currency;
  paymentStatus: PaymentStatus;
  paymentSchedule: string | null;
  outstandingBalance: number;
  /** YYYY-MM-DD the outstanding balance is due, if any. */
  balanceDueDate: string | null;
  /** When staff recorded the outstanding balance as collected. */
  balanceCollectedAt: string | null;
  balanceCollectedBy: string | null;
  /** Payment plan for the outstanding balance (empty for older contracts: see lib/payments). */
  instalments: Instalment[];
  templateVersionId: string;
  templateVersion?: number;
  fieldValues: FieldValues;
  documentPath: string | null;
  documentSha256: string | null;
  signedDocumentPath: string | null;
  signedDocumentSha256: string | null;
  esignProvider: EsignProvider;
  providerRequestId: string | null;
  providerSignatureId: string | null;
  providerData: Record<string, unknown> | null;
  linkNonce: string;
  linkExpiresAt: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  consentAt: string | null;
  signedAt: string | null;
  declinedAt: string | null;
  confirmationSentAt: string | null;
  isDemo: boolean;
  retentionUntil: string | null;
  anonymisedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewContract = Omit<
  Contract,
  "id" | "reference" | "createdAt" | "updatedAt" | "createdByName" | "templateVersion" | "amountPaidOn"
>;

export type ActorType = "staff" | "customer" | "provider" | "system";

export interface AuditEvent {
  id: string;
  contractId: string | null;
  actorType: ActorType;
  actorId: string | null;
  actorLabel: string | null;
  event: string;
  details: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface EmailLogEntry {
  id: string;
  contractId: string | null;
  kind: "signature_request" | "signature_confirmation" | "business_copy";
  to: string;
  subject: string;
  providerMessageId: string | null;
  simulated: boolean;
  createdAt: string;
}
