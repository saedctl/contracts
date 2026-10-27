import Link from "next/link";
import { BRAND } from "@/lib/brand";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="eyebrow">{BRAND.name}</p>
      <h1 className="mt-4 font-serif text-3xl font-semibold">Page not found</h1>
      <p className="mt-2 text-muted">The page you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.</p>
      <Link href="/dashboard" className="mt-6 rounded-lg bg-ink px-4 py-2.5 text-[15px] font-medium text-white">Go to dashboard</Link>
    </main>
  );
}
