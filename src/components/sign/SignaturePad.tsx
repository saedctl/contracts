"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

export type DemoSignatureValue = { kind: "draw" | "upload"; image: string } | { kind: "type"; typedName: string } | null;

/** Draw / type / upload signature capture. Used only for the demo-mode simulated signer. */
export function SignaturePad({ defaultName, onChange }: { defaultName: string; onChange: (v: DemoSignatureValue) => void }) {
  const [tab, setTab] = useState<"draw" | "type" | "upload">("draw");
  const [typed, setTyped] = useState(defaultName);
  const [upload, setUpload] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    if (tab === "type") onChange(typed.trim().length >= 2 ? { kind: "type", typedName: typed.trim() } : null);
    else if (tab === "upload") onChange(upload ? { kind: "upload", image: upload } : null);
    else onChange(hasInk && canvas.current ? { kind: "draw", image: canvas.current.toDataURL("image/png") } : null);
  }, [tab, typed, upload, hasInk, onChange]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || tab !== "draw") return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#141414";
    setHasInk(false);
  }, [tab]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div>
      <div role="tablist" className="mb-3 inline-flex rounded-lg border border-line-strong bg-white p-1">
        {(["draw", "type", "upload"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("rounded-md px-3 py-1 text-[14px] font-medium capitalize transition", tab === t ? "bg-ink text-white" : "text-muted hover:text-ink")}>
            {t}
          </button>
        ))}
      </div>
      {tab === "draw" && (
        <div className="relative">
          <canvas
            ref={canvas}
            aria-label="Draw your signature"
            className="h-40 w-full touch-none rounded-xl border border-line-strong bg-white"
            onPointerDown={(e) => {
              drawing.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              const ctx = e.currentTarget.getContext("2d")!;
              const p = pos(e);
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const ctx = e.currentTarget.getContext("2d")!;
              const p = pos(e);
              ctx.lineTo(p.x, p.y);
              ctx.stroke();
            }}
            onPointerUp={() => {
              drawing.current = false;
              setHasInk(true);
            }}
          />
          <span className="pointer-events-none absolute bottom-3 left-4 right-4 border-t border-dashed border-line-strong" />
          {hasInk && (
            <button type="button" className="absolute right-3 top-3 text-[13px] text-muted hover:text-ink" onClick={() => {
              const c = canvas.current!;
              c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
              setHasInk(false);
            }}>Clear</button>
          )}
        </div>
      )}
      {tab === "type" && (
        <div className="rounded-xl border border-line-strong bg-white p-4">
          <input value={typed} onChange={(e) => setTyped(e.target.value)} className="field-input" aria-label="Type your full name" maxLength={80} />
          <p className="mt-3 truncate font-serif text-3xl italic" aria-hidden>{typed || " "}</p>
        </div>
      )}
      {tab === "upload" && (
        <div className="rounded-xl border border-dashed border-line-strong bg-white p-5 text-center">
          {upload ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={upload} alt="Uploaded signature" className="mx-auto max-h-28" />
          ) : (
            <p className="text-[14px] text-muted">PNG or JPEG image of your signature, up to 1 MB.</p>
          )}
          <input type="file" accept="image/png,image/jpeg" className="mt-3 text-[14px]" onChange={(e) => {
            const f = e.target.files?.[0];
            setUploadError(null);
            if (!f) return;
            if (f.size > 1_000_000) return setUploadError("That image is larger than 1 MB.");
            const reader = new FileReader();
            reader.onload = () => setUpload(String(reader.result));
            reader.readAsDataURL(f);
          }} />
          {uploadError && <p className="mt-2 text-[13px] text-red-800">{uploadError}</p>}
        </div>
      )}
    </div>
  );
}
