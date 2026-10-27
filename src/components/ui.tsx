import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { ContractStatus } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-soft shadow-sm disabled:bg-ink/50",
  secondary: "bg-white text-ink border border-line-strong hover:border-ink/40 hover:bg-paper disabled:text-muted",
  ghost: "text-ink hover:bg-ink/5",
  danger: "bg-white text-red-800 border border-red-200 hover:bg-red-50",
};
const base =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[15px] font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-bronze-light/50 disabled:cursor-not-allowed whitespace-nowrap";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(base, variants[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(base, variants[variant], className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-2xl border border-line bg-white shadow-card", className)} {...props} />;
}

export function Field({ label, htmlFor, error, hint, required, children, className }: {
  label: string; htmlFor: string; error?: string; hint?: ReactNode; required?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[14px] font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-bronze" aria-hidden>*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-[13px] text-red-800" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const STATUS_STYLES: Record<ContractStatus, string> = {
  draft: "bg-stone-100 text-stone-700 ring-stone-200",
  sent: "bg-amber-50 text-amber-800 ring-amber-200",
  viewed: "bg-sky-50 text-sky-800 ring-sky-200",
  signed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  declined: "bg-red-50 text-red-800 ring-red-200",
  expired: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};
export const STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Draft", sent: "Sent", viewed: "Viewed", signed: "Signed", declined: "Declined", expired: "Expired",
};

export function StatusBadge({ status, demo }: { status: ContractStatus; demo?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-medium ring-1 ring-inset", STATUS_STYLES[status])}>
        <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
        {STATUS_LABELS[status]}
      </span>
      {demo && status === "signed" && (
        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-800 ring-1 ring-inset ring-red-200" title="Simulated signature in demo mode — not legally binding">
          Demo
        </span>
      )}
    </span>
  );
}

export function Alert({ tone = "info", children, className }: { tone?: "info" | "error" | "success" | "warning"; children: ReactNode; className?: string }) {
  const tones = {
    info: "bg-bronze-wash border-bronze-light/50 text-ink",
    error: "bg-red-50 border-red-200 text-red-900",
    success: "bg-emerald-50 border-emerald-200 text-emerald-900",
    warning: "bg-amber-50 border-amber-200 text-amber-900",
  };
  return <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-xl border px-4 py-3 text-[14px] leading-6", tones[tone], className)}>{children}</div>;
}

export function LockIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("animate-spin", className)} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
