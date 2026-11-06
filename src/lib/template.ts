// Contract template engine. Pure TypeScript (no Node APIs) so it can run on client and server.
//
// Template format (kept deliberately small so the approved legal wording is never altered):
//   # Heading / ## Sub-heading / ### Minor heading
//   Blank line           → new paragraph (single line breaks inside a paragraph are kept)
//   - item / * item      → bullet point
//   ✓ item / - [x] item  → tick-mark list item
//   > text               → highlighted callout box
//   ---                  → horizontal rule
//   **bold**  *italic*   → emphasis;  \*  → literal asterisk
//   {{placeholder}}      → replaced with the customer-specific value
//   {{parties}} / {{details_table}} / {{signatures}} on a line of their own place those
//   generated sections; any not placed are added automatically (see lib/document.ts).

export const PLACEHOLDERS = [
  { key: "customer_name", label: "Customer full name", example: "Sarah Ahmed" },
  { key: "customer_email", label: "Customer email", example: "sarah@example.com" },
  { key: "customer_phone", label: "Customer phone", example: "+44 7700 900123" },
  { key: "membership_start_date", label: "Membership start date", example: "1 November 2026" },
  { key: "membership_end_date", label: "Membership end date", example: "31 October 2027" },
  { key: "membership_duration", label: "Membership duration", example: "12 months" },
  { key: "membership_tier", label: "Membership tier", example: "Premium" },
  { key: "amount_paid", label: "Amount paid", example: "£999.00" },
  { key: "currency", label: "Currency code", example: "GBP" },
  { key: "payment_status", label: "Payment status", example: "Paid in Full" },
  { key: "outstanding_balance", label: "Outstanding balance", example: "£0.00" },
  { key: "payment_schedule", label: "Payment schedule", example: "Not applicable" },
  { key: "total_fee", label: "Total fee (paid + outstanding)", example: "£2,800" },
  { key: "balance_due_date", label: "Balance due date", example: "30 November 2026" },
  { key: "payment_summary", label: "Payment sentence (adapts to paid in full / balance due)", example: "The Client has paid £1,500 on 27 October 2026, with a remaining balance of £1,300 due by 30 November 2026." },
  { key: "contract_reference", label: "Contract reference", example: "TEC-2026-0042" },
  { key: "contract_date", label: "Date the agreement was issued", example: "27 October 2026" },
  { key: "company_name", label: "Legal company name", example: "Harbor Security Ltd" },
  { key: "business_name", label: "Business name", example: "The Engineers Club" },
  { key: "community_url", label: "Community website", example: "https://theengineers.club" },
] as const;

export type PlaceholderKey = (typeof PLACEHOLDERS)[number]["key"];

/** Placeholders that stand for a whole generated section and must be on a line of their own. */
export const BLOCK_PLACEHOLDERS = [
  { key: "parties", label: "Provider / client section", example: "" },
  { key: "details_table", label: "Membership details table", example: "" },
  { key: "signatures", label: "Signature block", example: "" },
] as const;
export type SectionKey = (typeof BLOCK_PLACEHOLDERS)[number]["key"];
const SECTION_KEYS = new Set<string>(BLOCK_PLACEHOLDERS.map((p) => p.key));

const KNOWN = new Set<string>([...PLACEHOLDERS.map((p) => p.key), ...SECTION_KEYS]);

export type Inline =
  | { kind: "text"; text: string; bold: boolean; italic: boolean }
  | { kind: "field"; key: string; bold: boolean; italic: boolean };

type TextBlockType = "h1" | "h2" | "h3" | "p" | "li" | "check" | "callout";

export type Block =
  | { type: TextBlockType; inlines: Inline[] }
  | { type: "hr" }
  | { type: "section"; key: SectionKey };

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function findPlaceholders(body: string): string[] {
  const keys = new Set<string>();
  for (const m of body.matchAll(PLACEHOLDER_RE)) keys.add(m[1]);
  return [...keys];
}

export interface TemplateCheck {
  used: string[];
  unknown: string[];
  missingRecommended: string[];
  /** Fill-in markers such as "[ADD: company number]" left in a draft. */
  unfilled: string[];
}

const UNFILLED_RE = /\[\s*(?:ADD|TODO|TBC|INSERT)\b[^\]]*\]/gi;

export function findUnfilled(body: string): string[] {
  return [...new Set(body.match(UNFILLED_RE) ?? [])];
}

export function checkTemplate(body: string): TemplateCheck {
  const used = findPlaceholders(body);
  return {
    used,
    unknown: used.filter((k) => !KNOWN.has(k)),
    unfilled: findUnfilled(body),
    // Client and membership details always appear in the generated details table, so no
    // individual placeholder is required in the template body.
    missingRecommended: [],
  };
}

function parseInlines(source: string): Inline[] {
  const out: Inline[] = [];
  let bold = false;
  let italic = false;
  let buf = "";
  const flush = () => {
    if (buf) out.push({ kind: "text", text: buf, bold, italic });
    buf = "";
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\" && i + 1 < source.length && /[\\*_{}#\-.+!()[\]`]/.test(source[i + 1])) {
      buf += source[++i];
      continue;
    }
    if (ch === "{" && source[i + 1] === "{") {
      const m = /^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/.exec(source.slice(i));
      if (m) {
        flush();
        out.push({ kind: "field", key: m[1], bold, italic });
        i += m[0].length - 1;
        continue;
      }
    }
    if (ch === "*" && source[i + 1] === "*") {
      flush();
      bold = !bold;
      i++;
      continue;
    }
    if (ch === "*") {
      const prev = source[i - 1];
      const next = source[i + 1];
      const opens = !italic && next !== undefined && !/\s/.test(next);
      const closes = italic && prev !== undefined && !/\s/.test(prev);
      if (opens || closes) {
        flush();
        italic = !italic;
        continue;
      }
    }
    buf += ch;
  }
  flush();
  return out;
}

export function parseTemplate(body: string): Block[] {
  const blocks: Block[] = [];
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  let quote: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", inlines: parseInlines(para.join("\n")) });
    para = [];
  };
  const flushQuote = () => {
    if (quote.length) blocks.push({ type: "callout", inlines: parseInlines(quote.join("\n")) });
    quote = [];
  };
  const flush = () => {
    flushPara();
    flushQuote();
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const callout = /^>\s?(.*)$/.exec(trimmed);
    if (callout) {
      flushPara();
      quote.push(callout[1]);
      continue;
    }
    flushQuote();
    const section = /^\{\{\s*([a-z_]+)\s*\}\}$/.exec(trimmed);
    if (section && SECTION_KEYS.has(section[1])) {
      flushPara();
      blocks.push({ type: "section", key: section[1] as SectionKey });
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushPara();
      const level = heading[1].length as 1 | 2 | 3;
      blocks.push({ type: `h${level}`, inlines: parseInlines(heading[2].replace(/\s*#+$/, "")) });
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushPara();
      blocks.push({ type: "hr" });
      continue;
    }
    const check = /^(?:[✓✔]|[-*]\s+\[[xX]\])\s+(.*)$/.exec(trimmed);
    if (check) {
      flushPara();
      blocks.push({ type: "check", inlines: parseInlines(check[1]) });
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flushPara();
      blocks.push({ type: "li", inlines: parseInlines(bullet[1]) });
      continue;
    }
    para.push(trimmed);
  }
  flush();
  return blocks;
}

/** Resolved inline text run, ready for rendering. */
export interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  field?: string;
  missing?: boolean;
}

export type RenderedBlock =
  | { type: TextBlockType; runs: Run[] }
  | { type: "hr" }
  | { type: "section"; key: SectionKey };

/**
 * Substitutes field values into parsed blocks. Values are inserted as plain text runs, so
 * customer input can never be interpreted as template markup or change the wording around it.
 */
export function renderTemplate(body: string, values: Record<string, string>): RenderedBlock[] {
  return parseTemplate(body).map((block) => {
    if (block.type === "hr" || block.type === "section") return block;
    return {
      type: block.type,
      runs: block.inlines.map((inline) => {
        if (inline.kind === "text") return { text: inline.text, bold: inline.bold, italic: inline.italic };
        const value = values[inline.key];
        const missing = value === undefined || value === "";
        return {
          text: missing ? `[${inline.key}]` : value,
          bold: inline.bold,
          italic: inline.italic,
          field: inline.key,
          missing,
        };
      }),
    };
  });
}

/**
 * Converts Markdown produced by mammoth (.docx import) into the template format. Only
 * formatting syntax is touched; the words themselves are left exactly as written.
 */
export function normaliseImportedMarkdown(md: string): string {
  return (
    md
      // mammoth emits <a id="..."></a> anchors and image placeholders we can't render
      .replace(/<a id="[^"]*"><\/a>/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      // [text](url) → text (url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, url: string) => (text === url ? text : `${text} (${url})`))
      // __bold__ → **bold**
      .replace(/__(.+?)__/g, "**$1**")
      // Word "{{ placeholder }}" may arrive with escaped underscores: {{customer\_name}}
      .replace(/\{\{([^}]*)\}\}/g, (_m, inner: string) => `{{${inner.replace(/\\_/g, "_").trim()}}}`)
      // 1\. numbered paragraphs: mammoth escapes the dot; the renderer treats "1." as plain text anyway
      .replace(/^(\s*\d+)\\\./gm, "$1.")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}
