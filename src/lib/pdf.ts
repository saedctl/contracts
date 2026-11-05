import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { BRAND } from "./brand";
import type { ContractDoc } from "./document";
import type { RenderedBlock, Run } from "./template";

const A4: [number, number] = [595.28, 841.89];
const MARGIN_X = 64;
const TOP = A4[1] - 84;
const BOTTOM = 76;
const CONTENT_W = A4[0] - MARGIN_X * 2;

type Color = ReturnType<typeof rgb>;
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const INK = hex(BRAND.colors.ink);
const BRONZE = hex(BRAND.colors.bronze);
const BRONZE_LIGHT = hex(BRAND.colors.bronzeLight);
const MUTED = hex(BRAND.colors.muted);
const LINE = hex(BRAND.colors.line);
const PANEL = hex("#f7f7f6");
const CALLOUT = hex("#f3eee7");
const RED = rgb(0.7, 0.15, 0.1);

export interface Box {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ContractLayout {
  signatureBox: Box;
  dateBox: Box;
}

interface Fonts {
  serif: PDFFont;
  serifBold: PDFFont;
  serifItalic: PDFFont;
  serifBoldItalic: PDFFont;
  sans: PDFFont;
  sansBold: PDFFont;
  tag: PDFFont;
}

const FONT_FILES = ["LiberationSerif-Regular", "LiberationSerif-Bold", "LiberationSerif-Italic", "LiberationSerif-BoldItalic", "LiberationSans-Regular", "LiberationSans-Bold"];

let fontCache: Promise<Record<string, Uint8Array>> | null = null;
function loadFontFiles() {
  fontCache ??= (async () => {
    // The working directory differs between hosts (Vercel, Netlify, local), so look in each.
    const candidates = [process.cwd(), process.env.LAMBDA_TASK_ROOT, path.join(process.cwd(), ".next", "standalone")]
      .filter((d): d is string => !!d)
      .map((d) => path.join(d, "assets", "fonts"));
    let dir = candidates[0];
    for (const c of candidates) {
      try {
        await fs.access(path.join(c, "LiberationSerif-Regular.ttf"));
        dir = c;
        break;
      } catch {}
    }
    const entries = await Promise.all(FONT_FILES.map(async (n) => [n, new Uint8Array(await fs.readFile(path.join(dir, `${n}.ttf`)))] as const));
    return Object.fromEntries(entries);
  })();
  return fontCache;
}

async function embedFonts(doc: PDFDocument): Promise<Fonts> {
  doc.registerFontkit(fontkit);
  const f = await loadFontFiles();
  const [serif, serifBold, serifItalic, serifBoldItalic, sans, sansBold, tag] = await Promise.all([
    doc.embedFont(f["LiberationSerif-Regular"], { subset: true }),
    doc.embedFont(f["LiberationSerif-Bold"], { subset: true }),
    doc.embedFont(f["LiberationSerif-Italic"], { subset: true }),
    doc.embedFont(f["LiberationSerif-BoldItalic"], { subset: true }),
    doc.embedFont(f["LiberationSans-Regular"], { subset: true }),
    doc.embedFont(f["LiberationSans-Bold"], { subset: true }),
    doc.embedFont(StandardFonts.Helvetica),
  ]);
  return { serif, serifBold, serifItalic, serifBoldItalic, sans, sansBold, tag };
}

// ---------------------------------------------------------------------------------------------
// Text layout
// ---------------------------------------------------------------------------------------------

type Piece = { text: string; font: PDFFont; size: number; width: number; kind: "word" | "space" | "break" };
interface Line {
  pieces: Piece[];
  width: number;
  /** Last line of a paragraph (or before a hard line break): never justified. */
  last: boolean;
}

function runFont(run: Pick<Run, "bold" | "italic">, fonts: Fonts, forceBold = false): PDFFont {
  const bold = run.bold || forceBold;
  if (bold && run.italic) return fonts.serifBoldItalic;
  if (bold) return fonts.serifBold;
  if (run.italic) return fonts.serifItalic;
  return fonts.serif;
}

/** Characters the embedded font can't encode are replaced rather than crashing generation. */
function safeText(font: PDFFont, text: string): string {
  try {
    font.encodeText(text);
    return text;
  } catch {
    return [...text].map((c) => { try { font.encodeText(c); return c; } catch { return "?"; } }).join("");
  }
}
function safeWidth(font: PDFFont, text: string, size: number) {
  return font.widthOfTextAtSize(safeText(font, text), size);
}

function toPieces(runs: Pick<Run, "text" | "bold" | "italic">[], fonts: Fonts, size: number, opts: { forceBold?: boolean; font?: PDFFont } = {}): Piece[] {
  const pieces: Piece[] = [];
  for (const run of runs) {
    const font = opts.font ?? runFont(run, fonts, opts.forceBold);
    for (const part of run.text.split(/(\n|[ \t]+)/)) {
      if (!part) continue;
      if (part === "\n") pieces.push({ text: "", font, size, width: 0, kind: "break" });
      else if (/^[ \t]+$/.test(part)) pieces.push({ text: " ", font, size, width: font.widthOfTextAtSize(" ", size), kind: "space" });
      else pieces.push({ text: part, font, size, width: safeWidth(font, part, size), kind: "word" });
    }
  }
  return pieces;
}

function wrap(pieces: Piece[], maxWidth: number): Line[] {
  const lines: Line[] = [];
  let line: Piece[] = [];
  let width = 0;
  const push = (last: boolean) => {
    while (line.length && line[line.length - 1].kind === "space") width -= line.pop()!.width;
    lines.push({ pieces: line, width, last });
    line = [];
    width = 0;
  };
  for (let p of pieces) {
    if (p.kind === "break") { push(true); continue; }
    if (p.kind === "space" && line.length === 0) continue;
    if (width + p.width > maxWidth && line.length) {
      push(false);
      if (p.kind === "space") continue;
    }
    if (p.kind === "word" && p.width > maxWidth) {
      // Very long token (e.g. a URL): hard-break by characters.
      let chunk = "";
      for (const ch of p.text) {
        if (safeWidth(p.font, chunk + ch, p.size) > maxWidth - width && chunk) {
          line.push({ ...p, text: chunk, width: safeWidth(p.font, chunk, p.size) });
          width += safeWidth(p.font, chunk, p.size);
          push(false);
          chunk = "";
        }
        chunk += ch;
      }
      p = { ...p, text: chunk, width: safeWidth(p.font, chunk, p.size) };
    }
    line.push(p);
    width += p.width;
  }
  push(true);
  return lines.filter((l, i) => l.pieces.length || i < lines.length - 1);
}

function drawLine(page: PDFPage, line: Line, x: number, y: number, opts: { color?: Color; justifyWidth?: number } = {}) {
  const spaces = line.pieces.filter((p) => p.kind === "space").length;
  const extra = opts.justifyWidth && !line.last && spaces ? Math.min((opts.justifyWidth - line.width) / spaces, 6) : 0;
  for (const p of line.pieces) {
    if (p.kind === "word") page.drawText(safeText(p.font, p.text), { x, y, size: p.size, font: p.font, color: opts.color ?? INK });
    x += p.width + (p.kind === "space" ? extra : 0);
  }
}

function centered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color: Color) {
  const t = safeText(font, text);
  page.drawText(t, { x: A4[0] / 2 - font.widthOfTextAtSize(t, size) / 2, y, size, font, color });
}

function drawLetterSpaced(page: PDFPage, text: string, opts: { y: number; size: number; font: PDFFont; color: Color; spacing: number; centerX: number }) {
  const widths = [...text].map((c) => opts.font.widthOfTextAtSize(c, opts.size));
  const total = widths.reduce((a, b) => a + b, 0) + opts.spacing * (text.length - 1);
  let x = opts.centerX - total / 2;
  [...text].forEach((c, i) => {
    page.drawText(c, { x, y: opts.y, size: opts.size, font: opts.font, color: opts.color });
    x += widths[i] + opts.spacing;
  });
}

class Writer {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = TOP;
  constructor(private doc: PDFDocument) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage(A4);
    this.pages.push(this.page);
    this.y = TOP;
  }
  ensure(height: number) {
    if (this.y - height < BOTTOM) this.newPage();
  }
  lines(lines: Line[], leading: number, opts: { indent?: number; color?: Color; justify?: boolean; width?: number } = {}) {
    const indent = opts.indent ?? 0;
    for (const line of lines) {
      this.ensure(leading);
      this.y -= leading;
      drawLine(this.page, line, MARGIN_X + indent, this.y, { color: opts.color, justifyWidth: opts.justify ? (opts.width ?? CONTENT_W - indent) : undefined });
    }
  }
}

function decorate(pages: PDFPage[], fonts: Fonts, reference: string) {
  pages.forEach((page, i) => {
    drawLetterSpaced(page, BRAND.name.toUpperCase(), { y: A4[1] - 46, size: 8.5, font: fonts.serif, color: BRONZE, spacing: 2.2, centerX: A4[0] / 2 });
    page.drawLine({ start: { x: MARGIN_X, y: A4[1] - 58 }, end: { x: A4[0] - MARGIN_X, y: A4[1] - 58 }, thickness: 0.6, color: BRONZE_LIGHT });
    page.drawLine({ start: { x: MARGIN_X, y: 52 }, end: { x: A4[0] - MARGIN_X, y: 52 }, thickness: 0.5, color: LINE });
    page.drawText(`${BRAND.legalName} · ${BRAND.websiteLabel}`, { x: MARGIN_X, y: 38, size: 7.5, font: fonts.sans, color: MUTED });
    const right = `Ref ${reference} · Page ${i + 1} of ${pages.length}`;
    page.drawText(right, { x: A4[0] - MARGIN_X - fonts.sans.widthOfTextAtSize(right, 7.5), y: 38, size: 7.5, font: fonts.sans, color: MUTED });
  });
}

function watermark(pages: PDFPage[], font: PDFFont, text: string, color = RED) {
  for (const p of pages) {
    const size = 34;
    const width = font.widthOfTextAtSize(text, size);
    p.drawText(text, { x: A4[0] / 2 - (width / 2) * Math.cos(Math.PI / 5), y: A4[1] / 2 - (width / 2) * Math.sin(Math.PI / 5), size, font, color, opacity: 0.13, rotate: degrees(36) });
  }
}

function drawCheck(page: PDFPage, x: number, y: number) {
  page.drawLine({ start: { x, y: y + 4 }, end: { x: x + 3, y: y + 1 }, thickness: 1.1, color: BRONZE });
  page.drawLine({ start: { x: x + 3, y: y + 1 }, end: { x: x + 9, y: y + 8 }, thickness: 1.1, color: BRONZE });
}

// ---------------------------------------------------------------------------------------------
// Contract PDF
// ---------------------------------------------------------------------------------------------

export interface SignatureImage {
  bytes: Uint8Array;
  type: "png" | "jpg";
}

export interface GenerateOptions {
  doc: ContractDoc;
  reference: string;
  templateVersion: number;
  issuedAt: Date;
  /** Image for the auto-applied company signature (otherwise the name is set in italics). */
  companySignatureImage?: SignatureImage | null;
  /** Adds hidden Dropbox Sign text tags for the signature and date fields. */
  textTags: boolean;
  demo: boolean;
  preview?: boolean;
}

const BODY = { size: 10.5, leading: 17 };

export async function generateContractPdf(opts: GenerateOptions): Promise<{ bytes: Uint8Array; layout: ContractLayout }> {
  const pdf = await PDFDocument.create();
  const { doc } = opts;
  pdf.setTitle(`${doc.title} ${opts.reference}`);
  pdf.setAuthor(BRAND.legalName);
  pdf.setCreator(`${BRAND.name} ${BRAND.productName}`);
  pdf.setProducer(`${BRAND.name} ${BRAND.productName}`);
  pdf.setSubject(`${doc.title} for ${doc.client.name}`);
  // Deterministic metadata: regenerating the same contract yields the same bytes.
  pdf.setCreationDate(opts.issuedAt);
  pdf.setModificationDate(opts.issuedAt);

  const fonts = await embedFonts(pdf);
  const companyImage: PDFImage | null = opts.companySignatureImage
    ? opts.companySignatureImage.type === "png" ? await pdf.embedPng(opts.companySignatureImage.bytes) : await pdf.embedJpg(opts.companySignatureImage.bytes)
    : null;
  const w = new Writer(pdf);
  let layout: ContractLayout | null = null;

  // ---- Title block ----
  w.y -= 6;
  drawLetterSpaced(w.page, doc.brand.toUpperCase(), { y: w.y, size: 8, font: fonts.sansBold, color: MUTED, spacing: 2.4, centerX: A4[0] / 2 });
  w.y -= 30;
  for (const line of wrap(toPieces([{ text: doc.title.toUpperCase(), bold: true, italic: false }], fonts, 19), CONTENT_W)) {
    centered(w.page, line.pieces.map((p) => (p.kind === "space" ? " " : p.text)).join(""), w.y, fonts.serifBold, 19, INK);
    w.y -= 24;
  }
  if (doc.tagline) {
    w.y -= 2;
    for (const line of wrap(toPieces([{ text: doc.tagline, bold: false, italic: true }], fonts, 10.5), CONTENT_W)) {
      centered(w.page, line.pieces.map((p) => (p.kind === "space" ? " " : p.text)).join(""), w.y, fonts.serifItalic, 10.5, MUTED);
      w.y -= 15;
    }
  }
  w.y -= 6;
  w.page.drawLine({ start: { x: MARGIN_X, y: w.y }, end: { x: A4[0] - MARGIN_X, y: w.y }, thickness: 1.6, color: INK });
  w.y -= 26;

  // ---- Sections ----
  const label = (page: PDFPage, text: string, x: number, y: number) =>
    page.drawText(text.toUpperCase(), { x, y, size: 7.5, font: fonts.sansBold, color: MUTED });

  const drawParties = () => {
    const colW = (CONTENT_W - 24) / 2;
    const left = wrap(toPieces([
      { text: doc.provider.legalName, bold: true, italic: false },
      { text: " trading as ", bold: false, italic: false },
      { text: `“${doc.provider.tradingAs}”`, bold: false, italic: true },
    ], fonts, BODY.size), colW);
    const right = wrap(toPieces([{ text: doc.client.name, bold: true, italic: false }], fonts, BODY.size), colW);
    w.ensure(20 + Math.max(left.length, right.length) * 15 + 20);
    label(w.page, "The Provider", MARGIN_X, w.y);
    label(w.page, "The Client", MARGIN_X + colW + 24, w.y);
    let yl = w.y - 6;
    for (const l of left) { yl -= 15; drawLine(w.page, l, MARGIN_X, yl); }
    let yr = w.y - 6;
    for (const l of right) { yr -= 15; drawLine(w.page, l, MARGIN_X + colW + 24, yr); }
    w.y = Math.min(yl, yr) - 22;
  };

  const drawDetails = () => {
    const pad = 14;
    const labelW = 130;
    const valueW = CONTENT_W - pad * 2 - labelW;
    const rows = doc.details.map((r) => ({ label: r.label, lines: wrap(toPieces([{ text: r.value, bold: true, italic: false }], fonts, 10), valueW) }));
    const rowH = (n: number) => 10 + n * 14;
    const total = rows.reduce((a, r) => a + rowH(r.lines.length), 0) + 8;
    w.ensure(total + 16);
    const top = w.y;
    w.page.drawRectangle({ x: MARGIN_X, y: top - total, width: CONTENT_W, height: total, color: PANEL, borderColor: LINE, borderWidth: 0.7 });
    let y = top - 4;
    rows.forEach((r, i) => {
      const h = rowH(r.lines.length);
      w.page.drawText(r.label, { x: MARGIN_X + pad, y: y - 16, size: 10, font: fonts.serif, color: MUTED });
      r.lines.forEach((l, j) => drawLine(w.page, l, MARGIN_X + pad + labelW, y - 16 - j * 14));
      y -= h;
      if (i < rows.length - 1) w.page.drawLine({ start: { x: MARGIN_X + pad, y }, end: { x: MARGIN_X + CONTENT_W - pad, y }, thickness: 0.5, color: LINE });
    });
    w.y = top - total - 24;
  };

  const drawSignatures = () => {
    const colW = (CONTENT_W - 32) / 2;
    const needed = 150;
    w.ensure(needed);
    w.y -= 8;
    w.page.drawLine({ start: { x: MARGIN_X, y: w.y }, end: { x: A4[0] - MARGIN_X, y: w.y }, thickness: 0.5, color: LINE });
    w.y -= 18;
    const areaH = 52;
    const lineY = w.y - areaH;
    const page = w.page;
    const pageIndex = w.pages.length - 1;
    const xs = [MARGIN_X, MARGIN_X + colW + 32];

    // Client
    const client = doc.signatures.client;
    const signatureBox: Box = { page: pageIndex, x: xs[0], y: lineY + 2, width: colW, height: areaH - 4 };
    page.drawLine({ start: { x: xs[0], y: lineY }, end: { x: xs[0] + colW, y: lineY }, thickness: 0.8, color: INK });
    page.drawText(safeText(fonts.serifBold, client.name), { x: xs[0], y: lineY - 17, size: 10.5, font: fonts.serifBold, color: INK });
    page.drawText("The Client — date signed:", { x: xs[0], y: lineY - 31, size: 9, font: fonts.serif, color: MUTED });
    const dateX = xs[0] + fonts.serif.widthOfTextAtSize("The Client — date signed:", 9) + 4;
    const dateBox: Box = { page: pageIndex, x: dateX, y: lineY - 34, width: Math.max(60, xs[0] + colW - dateX), height: 14 };
    if (opts.textTags) {
      // Dropbox Sign text tags, drawn invisibly. The provider places its signature and date-signed
      // fields over them; the tag's width sets the field width.
      const white = rgb(1, 1, 1);
      page.drawText(`[sig|req|signer1${" ".repeat(40)}]`, { x: signatureBox.x, y: signatureBox.y + 6, size: 12, font: fonts.tag, color: white });
      page.drawText(`[date|req|signer1${" ".repeat(10)}]`, { x: dateBox.x, y: dateBox.y + 3, size: 9, font: fonts.tag, color: white });
    }

    // Company (auto-applied)
    const company = doc.signatures.company;
    if (company) {
      if (companyImage) {
        const scale = Math.min((colW - 8) / companyImage.width, (areaH - 8) / companyImage.height);
        page.drawImage(companyImage, { x: xs[1], y: lineY + 4, width: companyImage.width * scale, height: companyImage.height * scale });
      } else {
        page.drawText(safeText(fonts.serifItalic, company.name), { x: xs[1], y: lineY + 10, size: 20, font: fonts.serifItalic, color: INK });
      }
      page.drawLine({ start: { x: xs[1], y: lineY }, end: { x: xs[1] + colW, y: lineY }, thickness: 0.8, color: INK });
      page.drawText(safeText(fonts.serifBold, company.name), { x: xs[1], y: lineY - 17, size: 10.5, font: fonts.serifBold, color: INK });
      for (const [i, l] of wrap(toPieces([{ text: `${company.role} — auto-applied ${company.appliedOn}`, bold: false, italic: false }], fonts, 9), colW).entries()) {
        drawLine(page, l, xs[1], lineY - 31 - i * 12, { color: MUTED });
      }
    }
    w.y = lineY - 52;
    layout = { signatureBox, dateBox };
  };

  // ---- Body ----
  const styles = {
    h1: { size: 15, leading: 20, before: 14, after: 4 },
    h2: { size: 12, leading: 17, before: 14, after: 3 },
    h3: { size: 10.5, leading: 15, before: 8, after: 2 },
    p: { size: BODY.size, leading: BODY.leading, before: 0, after: 8 },
    li: { size: BODY.size, leading: BODY.leading, before: 0, after: 2 },
    check: { size: BODY.size, leading: BODY.leading, before: 0, after: 3 },
    callout: { size: 10, leading: 15.5, before: 4, after: 12 },
  } as const;

  for (const block of doc.body as RenderedBlock[]) {
    if (block.type === "section") {
      if (block.key === "parties") drawParties();
      else if (block.key === "details_table") drawDetails();
      else drawSignatures();
      continue;
    }
    if (block.type === "hr") {
      w.ensure(20);
      w.y -= 10;
      w.page.drawLine({ start: { x: MARGIN_X, y: w.y }, end: { x: A4[0] - MARGIN_X, y: w.y }, thickness: 0.5, color: LINE });
      w.y -= 10;
      continue;
    }
    const s = styles[block.type];
    if (block.type === "callout") {
      const padX = 16;
      const lines = wrap(toPieces(block.runs, fonts, s.size), CONTENT_W - padX * 2 - 3);
      const h = lines.length * s.leading + 18;
      w.ensure(h + s.before);
      w.y -= s.before;
      w.page.drawRectangle({ x: MARGIN_X, y: w.y - h, width: CONTENT_W, height: h, color: CALLOUT });
      w.page.drawRectangle({ x: MARGIN_X, y: w.y - h, width: 3, height: h, color: BRONZE });
      let y = w.y - 6;
      for (const l of lines) { y -= s.leading; drawLine(w.page, l, MARGIN_X + padX + 3, y + 3); }
      w.y -= h + s.after;
      continue;
    }
    const isHeading = block.type === "h1" || block.type === "h2" || block.type === "h3";
    const indent = block.type === "li" || block.type === "check" ? 18 : 0;
    const lines = wrap(toPieces(block.runs, fonts, s.size, { forceBold: isHeading }), CONTENT_W - indent);
    // Keep headings with at least two lines of the following text.
    w.ensure(s.before + Math.min(lines.length, 3) * s.leading + (isHeading ? 2 * BODY.leading : 0));
    w.y -= s.before;
    if (indent) {
      w.ensure(s.leading);
      if (block.type === "check") drawCheck(w.page, MARGIN_X + 2, w.y - s.leading);
      else w.page.drawText("•", { x: MARGIN_X + 5, y: w.y - s.leading, size: s.size, font: fonts.serif, color: INK });
    }
    w.lines(lines, s.leading, { indent, justify: block.type === "p" });
    w.y -= s.after;
  }

  // ---- Document details ----
  w.ensure(70);
  w.y -= 6;
  const meta = `Reference ${opts.reference} · Template v${opts.templateVersion} · Issued ${opts.issuedAt.toISOString().slice(0, 10)} by ${BRAND.legalName}`;
  w.page.drawText(safeText(fonts.sans, meta), { x: MARGIN_X, y: w.y, size: 7.5, font: fonts.sans, color: MUTED });
  w.y -= 13;
  const note = opts.demo
    ? "DEMO DOCUMENT: generated in demo mode. Any signature applied to it is simulated and has no legal effect."
    : "This document is signed electronically. The e-signature provider's audit trail is appended to the completed document.";
  for (const line of wrap(toPieces([{ text: note, bold: false, italic: true }], fonts, 8), CONTENT_W)) {
    drawLine(w.page, line, MARGIN_X, w.y, { color: opts.demo ? RED : MUTED });
    w.y -= 11;
  }

  decorate(w.pages, fonts, opts.reference);
  if (opts.preview) watermark(w.pages, fonts.sansBold, "PREVIEW — NOT FOR SIGNATURE");
  if (!layout) throw new Error("Signature block missing from document");
  return { bytes: await pdf.save(), layout };
}

// ---------------------------------------------------------------------------------------------
// Demo mode
// ---------------------------------------------------------------------------------------------

export interface DemoSignature {
  kind: "draw" | "type" | "upload";
  /** PNG/JPEG data for draw/upload */
  image?: Uint8Array;
  imageType?: "png" | "jpg";
  typedName?: string;
}

/**
 * Applies a SIMULATED signature for demo mode. Every page is watermarked and a record page is
 * appended stating plainly that no legally binding signature took place.
 */
export async function applyDemoSignature(
  unsigned: Uint8Array,
  layout: ContractLayout,
  sig: DemoSignature,
  record: { label: string; value: string }[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(unsigned);
  const fonts = await embedFonts(doc);
  const pages = doc.getPages();
  const { signatureBox: box, dateBox } = layout;
  const page = pages[box.page];
  if (sig.image && sig.imageType) {
    const img = sig.imageType === "png" ? await doc.embedPng(sig.image) : await doc.embedJpg(sig.image);
    const scale = Math.min((box.width - 8) / img.width, (box.height - 4) / img.height);
    page.drawImage(img, { x: box.x + 2, y: box.y + 2, width: img.width * scale, height: img.height * scale });
  } else if (sig.typedName) {
    page.drawText(safeText(fonts.serifItalic, sig.typedName), { x: box.x + 2, y: box.y + 8, size: 20, font: fonts.serifItalic, color: INK });
  }
  page.drawText(new Date().toISOString().slice(0, 10), { x: dateBox.x, y: dateBox.y + 3, size: 9, font: fonts.serif, color: INK });

  const rec = doc.addPage(A4);
  let y = TOP - 10;
  rec.drawText("Demo signing record", { x: MARGIN_X, y, size: 17, font: fonts.serifBold, color: INK });
  y -= 24;
  rec.drawText("SIMULATED — NOT A LEGALLY BINDING SIGNATURE", { x: MARGIN_X, y, size: 9, font: fonts.sansBold, color: RED });
  y -= 28;
  for (const r of record) {
    rec.drawText(r.label, { x: MARGIN_X, y, size: 8.5, font: fonts.sans, color: MUTED });
    for (const line of wrap(toPieces([{ text: r.value, bold: false, italic: false }], fonts, 9), CONTENT_W - 130)) {
      drawLine(rec, line, MARGIN_X + 130, y);
      y -= 13;
    }
    y -= 4;
  }
  decorate([rec], fonts, "DEMO");
  watermark(doc.getPages(), fonts.sansBold, "DEMO — SIMULATED SIGNATURE");
  return doc.save();
}
