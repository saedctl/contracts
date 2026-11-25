import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { calendarLinks, resolveCalendarToken } from "@/lib/services/calendar";
import { planOf } from "@/lib/payments";
import { formatLongDate, formatMoney, todayISO } from "@/lib/utils";
import { Card, cx } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add payment dates to your calendar", robots: { index: false, follow: false } };

const APPS = [
  { key: "apple", label: "Apple Calendar", note: "iPhone, iPad and Mac" },
  { key: "google", label: "Google Calendar", note: "Android and Gmail" },
  { key: "outlook", label: "Outlook.com", note: "Hotmail, Live, Outlook" },
  { key: "office365", label: "Outlook for work", note: "Microsoft 365" },
] as const;

/** Member-facing: their payment dates and one button per calendar app. Reached from the signed-contract email. */
export default async function CalendarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const owner = await resolveCalendarToken(token);
  const c = owner?.kind === "member" ? owner.contract : null;
  const plan = c ? planOf(c, todayISO()).filter((it) => it.dueDate) : [];
  const links = c ? calendarLinks(token, `${BRAND.name} payments`) : null;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[720px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href={BRAND.website} className="font-serif text-[18px] font-semibold sm:text-[20px]">{BRAND.name}</a>
          <span className="text-[14px] text-muted">Payment dates</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-8 sm:px-6">
        {!c || !links ? (
          <Card className="p-6">
            <h1 className="font-serif text-[22px] font-semibold">This link isn&apos;t valid</h1>
            <p className="mt-2 text-[15px] text-muted">Please use the link in your most recent email from {BRAND.name}, or reply to it and we&apos;ll help.</p>
          </Card>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="eyebrow">Hi {c.customerName.split(" ")[0]}</p>
              <h1 className="mt-2 font-serif text-[26px] font-semibold leading-tight">Add your payment dates to your calendar</h1>
              <p className="mt-2 text-[15px] leading-6 text-muted">One tap adds them, with reminders 7 days and 24 hours before each payment and on the morning it&apos;s due. Your calendar updates by itself once a payment is received.</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {APPS.map((a) => (
                <a key={a.key} href={links[a.key]} target={a.key === "apple" ? undefined : "_blank"} rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3.5 transition hover:border-ink">
                  <span>
                    <span className="block text-[15px] font-semibold">{a.label}</span>
                    <span className="block text-[13px] text-muted">{a.note}</span>
                  </span>
                  <span aria-hidden className="text-bronze-dark">→</span>
                </a>
              ))}
            </div>
            <p className="text-[13px] text-muted">
              Other calendar? <a href={links.download} className="font-medium text-ink underline">Download the calendar file</a> and open it.
              {" "}Google Calendar uses your own notification settings rather than these reminders.
            </p>

            <Card className="overflow-hidden">
              <h2 className="border-b border-line px-5 py-3.5 text-[14px] font-semibold">Your payment schedule</h2>
              <ul className="divide-y divide-line">
                {plan.map((it, i) => (
                  <li key={it.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[14px]">
                    <span>
                      <span className="block font-medium">{formatLongDate(it.dueDate!)}</span>
                      <span className="block text-[12.5px] text-muted">{plan.length > 1 ? `Instalment ${i + 1} of ${plan.length}` : "Balance"}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold tabular-nums">{formatMoney(it.amount, c.currency)}</span>
                      <span className={cx("block text-[12.5px]", it.collectedAt ? "text-emerald-800" : it.state === "overdue" ? "font-medium text-red-800" : "text-muted")}>
                        {it.collectedAt ? "Paid ✓" : it.state === "overdue" ? "Overdue" : "Due"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <p className="text-[12.5px] text-muted">This page and calendar link are personal to you; please don&apos;t share them. {BRAND.name} is operated by {BRAND.legalName}.</p>
          </div>
        )}
      </main>
    </div>
  );
}
