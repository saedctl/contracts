import "server-only";
import { BRAND } from "../brand";
import { getStore } from "../db";
import { buildContractDoc, type ClientSignature, type CompanySignature, type ContractDoc } from "../document";
import type { SignatureImage } from "../pdf";
import type { RequestMeta } from "../request";
import type { Contract, FieldValues, StaffUser } from "../types";
import { formatLongDate, sha256Hex } from "../utils";
import { audit } from "./audit";
import { UserFacingError } from "../errors";

// ---------------------------------------------------------------------------------------------
// Company signature (auto-applied to every new contract)
// ---------------------------------------------------------------------------------------------

const SETTING_KEY = "company_signature";

export interface CompanySignatureSetting {
  enabled: boolean;
  name: string;
  role: string;
  imagePath: string | null;
  imageType: "png" | "jpg" | null;
  updatedAt: string;
}

export async function getCompanySignatureSetting(): Promise<CompanySignatureSetting | null> {
  return (await getStore()).getSetting<CompanySignatureSetting>(SETTING_KEY);
}

export async function saveCompanySignature(
  admin: StaffUser,
  input: { enabled: boolean; name: string; role: string; image?: { bytes: Uint8Array; type: "png" | "jpg" } | null; removeImage?: boolean },
  meta: RequestMeta,
) {
  if (admin.role !== "admin") throw new UserFacingError("Only administrators can change the company signature.");
  const name = input.name.trim();
  const role = input.role.trim() || `For ${BRAND.name}`;
  if (input.enabled && name.length < 2) throw new UserFacingError("Enter the name of the person signing for the company.");
  const store = await getStore();
  const current = await getCompanySignatureSetting();
  let imagePath = input.removeImage ? null : (current?.imagePath ?? null);
  let imageType = input.removeImage ? null : (current?.imageType ?? null);
  if (input.image) {
    // Stored under a content hash and never overwritten, so contracts that reference an
    // earlier signature keep showing exactly what was applied to them.
    imagePath = `settings/company-signature-${sha256Hex(input.image.bytes).slice(0, 16)}.${input.image.type}`;
    imageType = input.image.type;
    if (!(await store.getFile(imagePath))) await store.putFile(imagePath, input.image.bytes, input.image.type === "png" ? "image/png" : "image/jpeg");
  }
  const value: CompanySignatureSetting = { enabled: input.enabled, name, role, imagePath, imageType, updatedAt: new Date().toISOString() };
  await store.setSetting(SETTING_KEY, value);
  await audit(null, { type: "staff", user: admin }, "settings.company_signature_updated", { enabled: value.enabled, name, role, image: imagePath }, meta);
  return value;
}

/** Frozen onto each contract at generation, so later changes don't alter issued contracts. */
export function companySignatureFields(setting: CompanySignatureSetting | null): FieldValues {
  if (!setting?.enabled || !setting.name) return {};
  return {
    _company_signatory: setting.name,
    _company_signatory_role: setting.role,
    ...(setting.imagePath && setting.imageType ? { _company_signature_path: setting.imagePath, _company_signature_type: setting.imageType } : {}),
  };
}

async function loadImage(path: string | undefined, type: string | undefined): Promise<(SignatureImage & { dataUrl: string }) | null> {
  if (!path || (type !== "png" && type !== "jpg")) return null;
  const bytes = await (await getStore()).getFile(path);
  if (!bytes) return null;
  return { bytes, type, dataUrl: `data:image/${type === "png" ? "png" : "jpeg"};base64,${Buffer.from(bytes).toString("base64")}` };
}

async function companyFromFields(values: FieldValues): Promise<{ sig: CompanySignature | null; image: SignatureImage | null }> {
  if (!values._company_signatory) return { sig: null, image: null };
  const img = await loadImage(values._company_signature_path, values._company_signature_type);
  return {
    sig: {
      name: values._company_signatory,
      role: values._company_signatory_role || `For ${BRAND.name}`,
      appliedOn: values.contract_date,
      image: img?.dataUrl,
    },
    image: img ? { bytes: img.bytes, type: img.type } : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------------------

/** Document for a draft/preview: nobody has signed yet. */
export async function buildDoc(templateBody: string, values: FieldValues): Promise<{ doc: ContractDoc; companyImage: SignatureImage | null }> {
  const company = await companyFromFields(values);
  const client: ClientSignature = { name: values.customer_name, status: "pending" };
  return { doc: buildContractDoc(templateBody, values, { client, company: company.sig }), companyImage: company.image };
}

/** Document for an issued contract, reflecting its signing status. */
export async function contractDoc(c: Contract): Promise<ContractDoc> {
  const t = await (await getStore()).getTemplateVersion(c.templateVersionId);
  if (!t) throw new Error("Template version missing");
  const company = await companyFromFields(c.fieldValues);
  const demo = (c.providerData as { demoSignature?: { image?: string; typedName?: string } } | null)?.demoSignature;
  const client: ClientSignature =
    c.status === "signed"
      ? {
          name: c.customerName,
          status: "signed",
          signedOn: c.signedAt ? formatLongDate(c.signedAt.slice(0, 10)) : undefined,
          method: c.esignProvider,
          image: demo?.image,
          typedName: demo?.typedName,
        }
      : { name: c.customerName, status: "pending" };
  return buildContractDoc(t.body, c.fieldValues, { client, company: company.sig });
}
