import { getCurrentUser } from "@/lib/auth/session";
import { errorResponse, json } from "@/lib/api";
import { importDocx, MAX_TEMPLATE_CHARS } from "@/lib/services/templates";

const MAX_BYTES = 10 * 1024 * 1024;

/** Converts an uploaded agreement (.docx, .txt, .md) to template text for the admin to review. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return json({ error: "Administrators only." }, 403);
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "Choose a file to import." }, 400);
    if (file.size > MAX_BYTES) return json({ error: "That file is larger than 10 MB." }, 400);
    const name = file.name.toLowerCase();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let body: string;
    let warnings: string[] = [];
    if (name.endsWith(".docx")) {
      ({ body, warnings } = await importDocx(bytes));
    } else if (name.endsWith(".txt") || name.endsWith(".md")) {
      body = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } else if (name.endsWith(".pdf")) {
      return json({ error: "PDF files can't be edited reliably. Upload the Word (.docx) version of your agreement, or paste the text." }, 400);
    } else {
      return json({ error: "Upload a .docx, .txt or .md file." }, 400);
    }
    if (body.length > MAX_TEMPLATE_CHARS) return json({ error: "That document is too long." }, 400);
    return json({ body, warnings });
  } catch (e) {
    return errorResponse(e);
  }
}
