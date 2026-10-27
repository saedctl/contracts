// Contract template engine. Pure TypeScript (no Node APIs) so it can run on client and server.
//
// Template format (kept deliberately small so the approved legal wording is never altered):
//   # Heading / ## Sub-heading / ### Minor heading
//   Blank line           → new paragraph (single line breaks inside a paragraph are kept)
//   - item / * item      → bullet point
//   ---                  → horizontal rule
//   **bold**  *italic*   → emphasis;  \*  → literal asterisk
//   {{placeholder}}      → replaced with the customer-specific value

export const PLACEHOLDERS = [
  { key: "customer_name", label: "Customer full name", example: "Sarah Ahmed" },
  { key: "customer_email", label: "Customer email", example: "sarah@example.com" },
  { key: "customer_phone", label: "Customer phone", example: "+44 7700 900123" },
  { key: "membership_start_date", label: "Membership start date", example: "1 November 2026" },
  { key: "membership_end_date", label: "Membership end date", example: "31 October 2027" },
  { key: "membership_duration", label: "Membership duration", example: "12 months" },
  { key: "amount_paid", label: "Amount paid", example: "£999.00" },
  { key: "currency", label: "Currency code", example: "GBP" },
  { key: "payment_status", label: "Payment status", example: "Paid in Full" },
  { key: "outstanding_balance", label: "Outstanding balance", example: "£0.00" },
  { key: "payment_schedule", label: "Payment schedule", example: "Not applicable" },
  { key: "contract_reference", label: "Contract reference", example: "TEC-2026-0042" },
  { key: "contract_date", label: "Date the agreement was issued", example: "27 October 2026" },
  { key: "company_name", label: "Legal company name", example: "Harbor Security Ltd" },
  { key: "business_name", label: "Business name", example: "The Engineers Club" },
  { key: "community_url", label: "Community website", example: "https://theengineers.club" },
] as const;

export type PlaceholderKey = (typeof PLACEHOLDERS)[number]["key"];
const KNOWN = new Set<string>(PLACEHOLDERS.map((p) => p.key));

export type Inline =
  | { kind: "text"; text: string; bold: boolean; italic: boolean }
  | { kind: "field"; key: string; bold: boolean; italic: boolean };

export type Block =
  | { type: "h1" | "h2" | "h3" | "p" | "li"; inlines: Inline[] }
  | { type: "hr" };

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
}

export function checkTemplate(body: string): TemplateCheck {
  const used = findPlaceholders(body);
  return {
    used,
    unknown: used.filter((k) => !KNOWN.has(k)),
    missingRecommended: ["customer_name", "membership_start_date", "membership_end_date", "amount_paid"].filter(
      (k) => !used.includes(k),
    ),
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
  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", inlines: parseInlines(para.join("\n")) });
    para = [];
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
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
    const bullet = /^[-*•]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flushPara();
      blocks.push({ type: "li", inlines: parseInlines(bullet[1]) });
      continue;
    }
    para.push(trimmed);
  }
  flushPara();
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

export type RenderedBlock = { type: "h1" | "h2" | "h3" | "p" | "li"; runs: Run[] } | { type: "hr" };

/**
 * Substitutes field values into parsed blocks. Values are inserted as plain text runs, so
 * customer input can never be interpreted as template markup or change the wording around it.
 */
export function renderTemplate(body: string, values: Record<string, string>): RenderedBlock[] {
  return parseTemplate(body).map((block) => {
    if (block.type === "hr") return block;
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
