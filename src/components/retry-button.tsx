"use client";

import { useState } from "react";

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
      setStatus("idle");
      onRetried();
    } catch {
      setStatus("error");
      setMessage("Could not reach the server. Please try again.");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        className="rounded border border-border-strong px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
      >
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
