import { getCurrentUser } from "@/lib/auth/session";
import { errorResponse, json } from "@/lib/api";
import { requestMeta } from "@/lib/request";
import { saveCompanySignature } from "@/lib/services/document";

const MAX_BYTES = 1_000_000;

/** Saves the company signature that is auto-applied to new contracts (admins only). */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return json({ error: "Administrators only." }, 403);
  try {
    const form = await req.formData();
    const file = form.get("image");
    let image: { bytes: Uint8Array; type: "png" | "jpg" } | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) return json({ error: "The signature image must be under 1 MB." }, 400);
      const bytes = new Uint8Array(await file.arrayBuffer());
      // Check the file's actual content, not just its name.
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
      const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
      if (!isPng && !isJpg) return json({ error: "Upload a PNG or JPEG image." }, 400);
      image = { bytes, type: isPng ? "png" : "jpg" };
    }
    const saved = await saveCompanySignature(user, {
      enabled: form.get("enabled") === "on",
      name: String(form.get("name") ?? ""),
      role: String(form.get("role") ?? ""),
      image,
      removeImage: form.get("removeImage") === "on",
    }, await requestMeta());
    return json({ ok: true, enabled: saved.enabled, hasImage: !!saved.imagePath });
  } catch (e) {
    return errorResponse(e);
  }
}
