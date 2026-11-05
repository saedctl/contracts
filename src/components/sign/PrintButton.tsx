"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center rounded-lg border border-line-strong bg-white px-4 py-2 text-[14px] font-medium text-ink hover:bg-paper"
    >
      Print / save as PDF
    </button>
  );
}
