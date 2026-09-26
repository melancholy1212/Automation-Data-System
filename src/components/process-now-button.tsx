"use client";

import { useState } from "react";

import { IconLoader, IconPlay } from "@/components/icons";

// Nudges the queue via the unauthenticated /api/worker/process route —
// see that route's own comment for why it exists alongside the cron-gated
// /api/worker/tick.
export function ProcessNowButton({ onProcessed }: { onProcessed: () => void }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setStatus("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/worker/process", { method: "POST" });
      if (!response.ok) {
        setStatus("error");
        setMessage("Could not start processing right now.");
        return;
      }
      setStatus("idle");
      onProcessed();
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
        {status === "loading" ? "Starting…" : "Process now"}
      </button>
      {status === "error" && message ? (
        <span className="text-xs" style={{ color: "var(--status-failed)" }}>
          {message}
        </span>
      ) : null}
    </div>
  );
}
