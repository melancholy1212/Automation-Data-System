"use client";

import { useState } from "react";

import { IconLoader, IconPlay } from "@/components/icons";

// `onProcess` runs the parent's tick-until-stuck loop (lead-detail-live.tsx)
// — one click nudges the queue via /api/worker/process repeatedly until the
// run completes, stops for a real reason, or genuinely has nothing left to
// claim, rather than requiring one click per pipeline stage.
export function ProcessNowButton({ onProcess }: { onProcess: () => Promise<void> }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setStatus("loading");
    setMessage(null);
    try {
      await onProcess();
      setStatus("idle");
    } catch {
      setStatus("error");
      setMessage("Could not reach the server. Please try again.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {status === "loading" ? <IconLoader className="h-3.5 w-3.5 animate-spin-slow" /> : <IconPlay className="h-3.5 w-3.5" />}
        {status === "loading" ? "Processing…" : "Process now"}
      </button>
      {status === "error" && message ? (
        <span className="text-xs" style={{ color: "var(--status-failed)" }}>
          {message}
        </span>
      ) : null}
    </div>
  );
}
