"use client";

import { useState } from "react";

import { IconLoader, IconRetry } from "@/components/icons";

export function RetryButton({
  leadId,
  onRetried,
}: {
  leadId: string;
  onRetried: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setStatus("loading");
    setMessage(null);
    try {
      const response = await fetch(`/api/leads/${leadId}/retry`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setStatus("error");
        setMessage(body?.error?.message ?? "Could not retry this lead right now.");
        return;
      }
      // Best-effort: the retry itself only resets the run to be claimable
      // again — without this it would otherwise just sit there until the
      // next scheduled tick (see /api/worker/process's own comment).
      await fetch("/api/worker/process", { method: "POST" }).catch(() => undefined);
      setStatus("idle");
      onRetried();
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
        className="flex h-8 items-center gap-1.5 rounded-md border border-border-strong px-3 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {status === "loading" ? <IconLoader className="h-3.5 w-3.5 animate-spin-slow" /> : <IconRetry className="h-3.5 w-3.5" />}
        {status === "loading" ? "Retrying…" : "Retry"}
      </button>
      {status === "error" && message ? (
        <span className="text-xs" style={{ color: "var(--status-failed)" }}>
          {message}
        </span>
      ) : null}
    </div>
  );
}
