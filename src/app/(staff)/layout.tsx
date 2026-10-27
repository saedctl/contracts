import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { BRAND } from "@/lib/brand";
import { logoutAction } from "@/app/actions/auth";
import { AppNav } from "@/components/AppNav";
import { DemoBanner } from "@/components/DemoBanner";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      {config.demoMode && <DemoBanner />}
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link href="/dashboard" className="mr-auto flex flex-col leading-tight sm:mr-0">
            <span className="font-serif text-[11px] font-medium uppercase tracking-[0.3em] text-bronze">{BRAND.name}</span>
            <span className="font-serif text-[17px] font-semibold">{BRAND.productName}</span>
          </Link>
          <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1">
            <AppNav isAdmin={user.role === "admin"} />
          </div>
          <div className="flex items-center gap-2">
            <Link href="/account" className="hidden text-right text-[13px] leading-tight sm:block">
              <span className="block font-medium text-ink">{user.fullName}</span>
              <span className="block text-muted capitalize">{user.role === "admin" ? "Administrator" : "Sales"}</span>
            </Link>
            <form action={logoutAction}>
              <button className="rounded-lg px-3 py-1.5 text-[14px] font-medium text-muted transition hover:bg-ink/5 hover:text-ink">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      <footer className="border-t border-line py-6 text-center text-[12px] text-muted">
        {BRAND.name} is operated by {BRAND.legalName} · <a className="hover:text-ink" href={BRAND.website}>{BRAND.websiteLabel}</a>
      </footer>
    </div>
  );
}
