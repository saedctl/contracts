// Minimal iCalendar (RFC 5545) writer for payment-date calendars. Pure.

export interface IcsEvent {
  uid: string;
  /** YYYY-MM-DD; the event is placed at 09:00 UK time on that day. */
  date: string;
  summary: string;
  description?: string;
  url?: string;
  /** Reminder offsets before the event, e.g. ["P7D", "PT24H", "PT0M"]. Empty for no reminders. */
  alarms: string[];
}

const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds lines to 75 octets as the spec requires (continuation lines start with a space). */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (parts.length ? 74 : 75), bytes.length);
    // Don't split a multi-byte UTF-8 character.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
  }
  return parts.join("\r\n ");
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** 09:00 Europe/London on `date`, as a UTC instant (handles GMT/BST). */
export function nineAmUk(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 9));
  const hourInLondon = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).format(guess));
  return new Date(guess.getTime() - (hourInLondon - 9) * 3600_000);
}

export function buildIcs(opts: { name: string; description?: string; events: IcsEvent[] }): string {
  const now = stamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Engineers Club//Contract Dashboard//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    ...(opts.description ? [`X-WR-CALDESC:${escapeText(opts.description)}`] : []),
    "X-WR-TIMEZONE:Europe/London",
    // Subscribed calendars re-check every few hours, so paid instalments update by themselves.
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const e of opts.events) {
    const start = nineAmUk(e.date);
    const end = new Date(start.getTime() + 30 * 60_000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeText(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      ...(e.url ? [`URL:${e.url}`] : []),
      "TRANSP:TRANSPARENT",
    );
    for (const a of e.alarms) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(e.summary)}`, `TRIGGER:-${a}`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
