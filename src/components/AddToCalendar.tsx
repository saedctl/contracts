"use client";

import { useState } from "react";
import type { CalendarLinks } from "@/lib/services/calendar";
import { cx } from "@/components/ui";

const APPS: { key: keyof CalendarLinks; label: string; note?: string }[] = [
  { key: "apple", label: "Apple Calendar", note: "iPhone, iPad, Mac" },
  { key: "google", label: "Google Calendar" },
  { key: "outlook", label: "Outlook.com" },
  { key: "office365", label: "Outlook (work / Microsoft 365)" },
];

/** "Add to calendar" menu: one click per calendar app, plus a file download and copyable link. */
export function AddToCalendar({ links, label = "Add to calendar", resettable, align = "right", big }: {
  links: CalendarLinks;
  label?: string;
  resettable?: boolean;
  align?: "left" | "right";
  big?: boolean;
}) {
  const [current, setCurrent] = useState(links);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(current.feed);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this calendar link:", current.feed);
    }
  }

  async function reset() {
    if (!window.confirm("Create a new calendar link? The old link stops working, so calendars using it will need adding again.")) return;
    const res = await fetch("/api/calendar/reset", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.links) {
      setCurrent(data.links);
      setMsg("New link created. Add it to your calendar again.");
    } else setMsg(data.error ?? "Couldn't reset the link.");
  }

  return (
    <details className="group relative">
      <summary className={cx(
        "inline-flex cursor-pointer list-none items-center gap-2 rounded-full border border-line bg-white font-medium text-ink transition hover:border-line-strong [&::-webkit-details-marker]:hidden",
        big ? "px-5 py-3 text-[15px]" : "px-3.5 py-1.5 text-[13.5px]",
      )}>
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" strokeLinecap="round" /></svg>
        {label}
        <svg viewBox="0 0 16 16" className="size-3 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      <div className={cx("absolute z-20 mt-2 w-72 rounded-xl border border-line bg-white p-1.5 text-[14px] shadow-pop", align === "right" ? "right-0" : "left-0")}>
        {APPS.map((a) => (
          <a key={a.key} href={current[a.key]} target={a.key === "apple" ? undefined : "_blank"} rel="noreferrer" className="flex items-baseline justify-between gap-2 rounded-lg px-3 py-2 hover:bg-paper">
            <span className="font-medium">{a.label}</span>
            {a.note && <span className="text-[12px] text-muted">{a.note}</span>}
          </a>
        ))}
        <a href={current.download} className="block rounded-lg px-3 py-2 hover:bg-paper">
          <span className="font-medium">Download file (.ics)</span>
          <span className="block text-[12px] text-muted">One-off copy; won&apos;t update when payments are made</span>
        </a>
        <button type="button" onClick={copy} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-paper">
          <span className="font-medium">{copied ? "Link copied ✓" : "Copy calendar link"}</span>
        </button>
        {resettable && (
          <button type="button" onClick={reset} className="block w-full rounded-lg px-3 py-2 text-left text-[13px] text-muted hover:bg-paper">
            Reset link (if it was shared by mistake)
          </button>
        )}
        {msg && <p className="px-3 py-2 text-[12.5px] text-muted">{msg}</p>}
        <p className="border-t border-line px-3 pb-1.5 pt-2 text-[12px] leading-4 text-muted">Reminders 7 days and 24 hours before, and at 9am on the day. Google Calendar uses your own notification settings instead.</p>
      </div>
    </details>
  );
}
