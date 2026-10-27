import { contractInputSchema } from "@/lib/validation";
import { json, pdfResponse, readJson, staffRoute } from "@/lib/api";
import { previewContract, previewPdf } from "@/lib/services/contracts";

export const POST = staffRoute(async (req) => {
  const body = (await readJson(req)) as { input?: unknown };
  const input = contractInputSchema.parse(body.input);
  if (new URL(req.url).searchParams.get("format") === "pdf") {
    return pdfResponse(await previewPdf(input), "Preview - Membership Agreement.pdf");
  }
  const { template, blocks } = await previewContract(input);
  return json({ blocks, templateVersion: template.version, templateTitle: template.title, isSample: template.isSample });
});
