"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export function AppNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = [
    { href: "/dashboard", label: "Contracts", match: (p: string) => p === "/dashboard" || p.startsWith("/contracts") },
    ...(isAdmin
      ? [
          { href: "/admin/template", label: "Template", match: (p: string) => p.startsWith("/admin/template") },
          { href: "/admin/staff", label: "Staff", match: (p: string) => p.startsWith("/admin/staff") },
          { href: "/admin/audit", label: "Audit log", match: (p: string) => p.startsWith("/admin/audit") },
        ]
      : []),
  ];
  return (
    <nav className="-mx-1 flex items-center gap-1 overflow-x-auto" aria-label="Main">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cx(
            "rounded-lg px-3 py-1.5 text-[14px] font-medium transition",
            l.match(pathname) ? "bg-ink text-white" : "text-muted hover:bg-ink/5 hover:text-ink",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
