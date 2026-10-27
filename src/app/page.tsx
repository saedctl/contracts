import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { BRAND } from "@/lib/brand";
import { getStore } from "@/lib/db";
import { Card } from "@/components/ui";
import { LoginForm } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (config.demoMode) await getStore(); // first run: creates demo accounts and DEMO_LOGIN.txt
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-[460px]">
        <div className="mb-10 text-center">
          <p className="eyebrow">{BRAND.name}</p>
          <h1 className="mt-4 font-serif text-[34px] font-semibold leading-tight tracking-tight sm:text-[38px]">{BRAND.productName}</h1>
          <p className="mx-auto mt-3 max-w-xs text-[17px] leading-7 text-muted">Sign in to create and manage membership contracts.</p>
        </div>
        <Card className="p-6 sm:p-9">
          <LoginForm />
        </Card>
        {config.demoMode && (
          <p className="mt-6 text-center text-[13px] leading-5 text-muted">
            <span className="font-semibold text-bronze-dark">Demo mode.</span> Sign-in details for the demo accounts are printed in the server log and saved to <code className="rounded bg-white px-1">.data/DEMO_LOGIN.txt</code>.
          </p>
        )}
      </div>
    </main>
  );
}
