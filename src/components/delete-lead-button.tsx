"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { IconLoader, IconTrash } from "@/components/icons";

// Permanently deletes a lead (and everything derived from it — evidence,
// classification, qualification, brief, processing history) via
// delete_lead_cascade. A two-step inline confirm rather than a native
// confirm() dialog, consistent with this app never using browser-native
// dialogs anywhere else.
export function DeleteLeadButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "confirming" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleConfirm() {
    setStatus("loading");
    setMessage(null);
    try {
      const response = await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setStatus("error");
        setMessage(body?.error?.message ?? "Could not delete this lead right now.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("Could not reach the server. Please try again.");
    }
  }

  if (status === "confirming" || status === "loading") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Delete this lead permanently?</span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={status === "loading"}
          className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: "var(--status-failed)" }}
        >
          {status === "loading" ? <IconLoader className="h-3.5 w-3.5 animate-spin-slow" /> : null}
          {status === "loading" ? "Deleting…" : "Confirm delete"}
        </button>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          disabled={status === "loading"}
          className="flex h-8 items-center rounded-md border border-border px-3 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setStatus("confirming")}
        className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-muted transition-colors hover:border-status-failed hover:text-status-failed"
      >
        <IconTrash className="h-3.5 w-3.5" />
        Delete
      </button>
      {status === "error" && message ? (
        <span className="text-xs" style={{ color: "var(--status-failed)" }}>
          {message}
        </span>
      ) : null}
    </div>
  );
}
