import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { BRAND } from "./brand";
import type { RenderedBlock, Run } from "./template";

const A4: [number, number] = [595.28, 841.89];
const MARGIN_X = 64;
const TOP = A4[1] - 84;
const BOTTOM = 76;
const CONTENT_W = A4[0] - MARGIN_X * 2;

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const INK = hex(BRAND.colors.ink);
const BRONZE = hex(BRAND.colors.bronze);
const BRONZE_LIGHT = hex(BRAND.colors.bronzeLight);
const MUTED = hex(BRAND.colors.muted);
const LINE = hex(BRAND.colors.line);

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
  sans: PDFFont;
  sansBold: PDFFont;
  tag: PDFFont;
}

let fontCache: Promise<Record<string, Uint8Array>> | null = null;
function loadFontFiles() {
  fontCache ??= (async () => {
    const dir = path.join(process.cwd(), "assets", "fonts");
    const names = ["LiberationSerif-Regular", "LiberationSerif-Bold", "LiberationSerif-Italic", "LiberationSans-Regular", "LiberationSans-Bold"];
    const entries = await Promise.all(names.map(async (n) => [n, new Uint8Array(await fs.readFile(path.join(dir, `${n}.ttf`)))] as const));
    return Object.fromEntries(entries);
  })();
  return fontCache;
}

async function embedFonts(doc: PDFDocument): Promise<Fonts> {
  doc.registerFontkit(fontkit);
  const files = await loadFontFiles();
  const [serif, serifBold, serifItalic, sans, sansBold, tag] = await Promise.all([
    doc.embedFont(files["LiberationSerif-Regular"], { subset: true }),
    doc.embedFont(files["LiberationSerif-Bold"], { subset: true }),
    doc.embedFont(files["LiberationSerif-Italic"], { subset: true }),
    doc.embedFont(files["LiberationSans-Regular"], { subset: true }),
    doc.embedFont(files["LiberationSans-Bold"], { subset: true }),
    doc.embedFont(StandardFonts.Helvetica),
  ]);
  return { serif, serifBold, serifItalic, sans, sansBold, tag };
}

type Piece = { text: string; font: PDFFont; size: number; width: number; kind: "word" | "space" | "break" };

function runFont(run: Run, fonts: Fonts, forceBold = false): PDFFont {
  if (run.bold || forceBold) return fonts.serifBold;
  if (run.italic) return fonts.serifItalic;
  return fonts.serif;
}

function toPieces(runs: Run[], fonts: Fonts, size: number, forceBold = false): Piece[] {
  const pieces: Piece[] = [];
  for (const run of runs) {
    const font = runFont(run, fonts, forceBold);
    for (const part of run.text.split(/(\n|[ \t]+)/)) {
      if (!part) continue;
      if (part === "\n") pieces.push({ text: "", font, size, width: 0, kind: "break" });
      else if (/^[ \t]+$/.test(part)) pieces.push({ text: " ", font, size, width: font.widthOfTextAtSize(" ", size), kind: "space" });
      else pieces.push({ text: part, font, size, width: safeWidth(font, part, size), kind: "word" });
    }
  }
  return pieces;
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

function wrap(pieces: Piece[], maxWidth: number): Piece[][] {
  const lines: Piece[][] = [];
  let line: Piece[] = [];
  let width = 0;
  const push = () => {
    while (line.length && line[line.length - 1].kind === "space") line.pop();
    lines.push(line);
    line = [];
    width = 0;
  };
  for (let p of pieces) {
    if (p.kind === "break") { push(); continue; }
    if (p.kind === "space" && line.length === 0) continue;
    if (width + p.width > maxWidth && line.length) {
      push();
      if (p.kind === "space") continue;
    }
    if (p.kind === "word" && p.width > maxWidth) {
      // Very long token (e.g. a URL): hard-break by characters.
      let chunk = "";
      for (const ch of p.text) {
        const w = safeWidth(p.font, chunk + ch, p.size);
        if (w > maxWidth - width && chunk) {
          line.push({ ...p, text: chunk, width: safeWidth(p.font, chunk, p.size) });
          push();
          chunk = "";
        }
        chunk += ch;
      }
      p = { ...p, text: chunk, width: safeWidth(p.font, chunk, p.size) };
    }
    line.push(p);
    width += p.width;
  }
  if (line.length) push();
  return lines;
}

class Writer {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = TOP;
  constructor(private doc: PDFDocument, private fonts: Fonts) {
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
  drawLines(lines: Piece[][], leading: number, indent = 0, color = INK) {
    for (const line of lines) {
      this.ensure(leading);
      this.y -= leading;
      let x = MARGIN_X + indent;
      for (const p of line) {
        if (p.kind === "word") this.page.drawText(safeText(p.font, p.text), { x, y: this.y, size: p.size, font: p.font, color });
        x += p.width;
      }
    }
  }
}

function drawLetterSpaced(page: PDFPage, text: string, opts: { y: number; size: number; font: PDFFont; color: ReturnType<typeof rgb>; spacing: number; centerX: number }) {
  const widths = [...text].map((c) => opts.font.widthOfTextAtSize(c, opts.size));
  const total = widths.reduce((a, b) => a + b, 0) + opts.spacing * (text.length - 1);
  let x = opts.centerX - total / 2;
  [...text].forEach((c, i) => {
    page.drawText(c, { x, y: opts.y, size: opts.size, font: opts.font, color: opts.color });
    x += widths[i] + opts.spacing;
  });
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

export interface GenerateOptions {
  blocks: RenderedBlock[];
  reference: string;
  templateVersion: number;
  customerName: string;
  customerEmail: string;
  issuedAt: Date;
  /** Adds hidden Dropbox Sign text tags for the signature and date fields. */
  textTags: boolean;
  demo: boolean;
  preview?: boolean;
}

export async function generateContractPdf(opts: GenerateOptions): Promise<{ bytes: Uint8Array; layout: ContractLayout }> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Membership Agreement ${opts.reference}`);
  doc.setAuthor(BRAND.legalName);
  doc.setCreator(`${BRAND.name} ${BRAND.productName}`);
  doc.setProducer(`${BRAND.name} ${BRAND.productName}`);
  doc.setSubject(`Membership agreement for ${opts.customerName}`);
  // Deterministic metadata: regenerating the same contract yields the same bytes.
  doc.setCreationDate(opts.issuedAt);
  doc.setModificationDate(opts.issuedAt);

  const fonts = await embedFonts(doc);
  const w = new Writer(doc, fonts);

  const styles = {
    h1: { size: 17, leading: 22, before: 6, after: 8 },
    h2: { size: 12.5, leading: 17, before: 12, after: 4 },
    h3: { size: 11, leading: 15, before: 8, after: 2 },
    p: { size: 10.5, leading: 15, before: 0, after: 7 },
    li: { size: 10.5, leading: 15, before: 0, after: 3 },
  } as const;

  for (const block of opts.blocks) {
    if (block.type === "hr") {
      w.ensure(16);
      w.y -= 8;
      w.page.drawLine({ start: { x: MARGIN_X, y: w.y }, end: { x: A4[0] - MARGIN_X, y: w.y }, thickness: 0.5, color: LINE });
      w.y -= 8;
      continue;
    }
    const s = styles[block.type];
    const isHeading = block.type.startsWith("h");
    const indent = block.type === "li" ? 16 : 0;
    const lines = wrap(toPieces(block.runs, fonts, s.size, isHeading), CONTENT_W - indent);
    // Keep headings with at least two lines of the following text.
    w.ensure(s.before + lines.length * s.leading + (isHeading ? 34 : 0));
    w.y -= s.before;
    if (block.type === "li") {
      w.ensure(s.leading);
      w.page.drawText("•", { x: MARGIN_X + 4, y: w.y - s.leading, size: s.size, font: fonts.serif, color: INK });
    }
    w.drawLines(lines, s.leading, indent);
    w.y -= s.after;
  }

  // Execution page: labelled fields only; no contractual wording is added.
  w.newPage();
  const page = w.page;
  const pageIndex = w.pages.length - 1;
  let y = TOP - 10;
  page.drawText("Signature", { x: MARGIN_X, y, size: 17, font: fonts.serifBold, color: INK });
  y -= 30;
  page.drawText("MEMBER", { x: MARGIN_X, y, size: 8, font: fonts.sansBold, color: BRONZE });
  y -= 22;
  const label = (text: string, value: string) => {
    page.drawText(text, { x: MARGIN_X, y, size: 9, font: fonts.sans, color: MUTED });
    page.drawText(safeText(fonts.serif, value), { x: MARGIN_X + 110, y, size: 11, font: fonts.serif, color: INK });
    y -= 24;
  };
  label("Full name", opts.customerName);
  label("Email", opts.customerEmail);

  y -= 6;
  page.drawText("Signature", { x: MARGIN_X, y: y + 4, size: 9, font: fonts.sans, color: MUTED });
  const signatureBox: Box = { page: pageIndex, x: MARGIN_X + 110, y: y - 40, width: 240, height: 56 };
  page.drawRectangle({ ...signatureBox, borderColor: LINE, borderWidth: 0.8, color: rgb(1, 1, 1) });
  y -= 70;
  page.drawText("Date signed", { x: MARGIN_X, y: y + 4, size: 9, font: fonts.sans, color: MUTED });
  const dateBox: Box = { page: pageIndex, x: MARGIN_X + 110, y: y - 6, width: 160, height: 22 };
  page.drawLine({ start: { x: dateBox.x, y: dateBox.y }, end: { x: dateBox.x + dateBox.width, y: dateBox.y }, thickness: 0.8, color: LINE });

  if (opts.textTags) {
    // Dropbox Sign text tags, rendered invisibly. The provider places its own signature and
    // date-signed fields over them. The tag's width sets the field width.
    const white = rgb(1, 1, 1);
    page.drawText(`[sig|req|signer1${" ".repeat(48)}]`, { x: signatureBox.x + 4, y: signatureBox.y + 8, size: 12, font: fonts.tag, color: white });
    page.drawText(`[date|req|signer1${" ".repeat(18)}]`, { x: dateBox.x + 2, y: dateBox.y + 3, size: 10, font: fonts.tag, color: white });
  }

  y -= 64;
  page.drawLine({ start: { x: MARGIN_X, y }, end: { x: A4[0] - MARGIN_X, y }, thickness: 0.5, color: LINE });
  y -= 22;
  page.drawText("DOCUMENT DETAILS", { x: MARGIN_X, y, size: 8, font: fonts.sansBold, color: BRONZE });
  y -= 20;
  const detail = (k: string, v: string) => {
    page.drawText(k, { x: MARGIN_X, y, size: 8.5, font: fonts.sans, color: MUTED });
    page.drawText(v, { x: MARGIN_X + 110, y, size: 8.5, font: fonts.sans, color: INK });
    y -= 15;
  };
  detail("Reference", opts.reference);
  detail("Issued by", BRAND.legalName);
  detail("Template version", `v${opts.templateVersion}`);
  detail("Issued on", opts.issuedAt.toISOString().slice(0, 10));
  y -= 8;
  const note = opts.demo
    ? "DEMO DOCUMENT: generated in demo mode. Any signature applied to it is simulated and has no legal effect."
    : "This document is signed electronically. The e-signature provider's audit trail is appended to the completed document.";
  for (const line of wrap(toPieces([{ text: note, bold: false, italic: true }], fonts, 8.5), CONTENT_W)) {
    page.drawText(line.map((p) => (p.kind === "space" ? " " : p.text)).join(""), { x: MARGIN_X, y, size: 8.5, font: fonts.serifItalic, color: opts.demo ? rgb(0.7, 0.15, 0.1) : MUTED });
    y -= 12;
  }

  decorate(w.pages, fonts, opts.reference);
  if (opts.preview) watermark(w.pages, fonts.sansBold, "PREVIEW — NOT FOR SIGNATURE");

  return { bytes: await doc.save(), layout: { signatureBox, dateBox } };
}

function watermark(pages: PDFPage[], font: PDFFont, text: string, color = rgb(0.75, 0.2, 0.15)) {
  for (const p of pages) {
    const size = 34;
    const width = font.widthOfTextAtSize(text, size);
    p.drawText(text, { x: A4[0] / 2 - (width / 2) * Math.cos(Math.PI / 5), y: A4[1] / 2 - (width / 2) * Math.sin(Math.PI / 5), size, font, color, opacity: 0.13, rotate: degrees(36) });
  }
}

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
    const scale = Math.min((box.width - 12) / img.width, (box.height - 8) / img.height);
    page.drawImage(img, { x: box.x + 6, y: box.y + 4, width: img.width * scale, height: img.height * scale });
  } else if (sig.typedName) {
    page.drawText(safeText(fonts.serifItalic, sig.typedName), { x: box.x + 10, y: box.y + 18, size: 22, font: fonts.serifItalic, color: INK });
  }
  page.drawText(new Date().toISOString().slice(0, 10), { x: dateBox.x + 2, y: dateBox.y + 5, size: 11, font: fonts.serif, color: INK });

  const rec = doc.addPage(A4);
  let y = TOP - 10;
  rec.drawText("Demo signing record", { x: MARGIN_X, y, size: 17, font: fonts.serifBold, color: INK });
  y -= 24;
  rec.drawText("SIMULATED — NOT A LEGALLY BINDING SIGNATURE", { x: MARGIN_X, y, size: 9, font: fonts.sansBold, color: rgb(0.7, 0.15, 0.1) });
  y -= 28;
  for (const r of record) {
    rec.drawText(r.label, { x: MARGIN_X, y, size: 8.5, font: fonts.sans, color: MUTED });
    for (const line of wrap(toPieces([{ text: r.value, bold: false, italic: false }], fonts, 9), CONTENT_W - 130)) {
      rec.drawText(line.map((p) => (p.kind === "space" ? " " : p.text)).join(""), { x: MARGIN_X + 130, y, size: 9, font: fonts.serif, color: INK });
      y -= 13;
    }
    y -= 4;
  }
  const all = doc.getPages();
  decorate([rec], fonts, "DEMO");
  watermark(all, fonts.sansBold, "DEMO — SIMULATED SIGNATURE");
  return doc.save();
}
