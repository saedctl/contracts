"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner, cx } from "@/components/ui";

/** Records (or, for admins, undoes) collection of a contract's outstanding balance. */
export function MarkCollectedButton({ id, instalmentId, amount, collected, canUndo, compact, label }: {
  id: string;
  instalmentId: string;
  amount: string;
  collected: boolean;
  canUndo: boolean;
  compact?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (collected && !canUndo) return null;

  async function run() {
    const msg = collected ? "Undo the recorded payment? The balance will show as outstanding again." : `Record that ${amount} has been collected?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts/${id}/payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instalmentId, collected: !collected }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={cx(
          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border font-medium transition disabled:opacity-60",
          compact ? "px-2.5 py-1 text-[13px]" : "px-3.5 py-2 text-[14px]",
          collected ? "border-transparent text-muted hover:text-ink" : "border-line-strong bg-white text-ink hover:border-ink/40",
        )}
      >
        {busy && <Spinner className="size-3.5" />}
        {collected ? "Undo" : (label ?? "Mark collected")}
      </button>
      {error && <span className="max-w-[200px] text-right text-[12px] text-red-800">{error}</span>}
    </span>
  );
}
