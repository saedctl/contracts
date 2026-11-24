"use client";

import { useState } from "react";

/** Small "copy to clipboard" button. */
export function CopyButton({ value, label, copiedLabel = "Copied ✓" }: { value: string; label: string; copiedLabel?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this link:", value);
        }
      }}
      className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-1.5 text-[13.5px] font-medium text-ink transition hover:border-line-strong"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
