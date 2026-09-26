"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { IconClose, IconPlus } from "@/components/icons";

interface FieldErrors {
  [field: string]: string[] | undefined;
}

interface FormState {
  status: "idle" | "submitting" | "success" | "duplicate" | "error";
  fieldErrors?: FieldErrors;
  message?: string;
  leadId?: string;
}

const INITIAL_STATE: FormState = { status: "idle" };

export function AddLeadDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(INITIAL_STATE);

  function close() {
    setOpen(false);
    setState(INITIAL_STATE);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "submitting" });

    const form = new FormData(event.currentTarget);
    const payload: Record<string, string> = {};
    for (const field of ["company_name", "website", "contact_name", "email", "linkedin_url", "industry", "country"]) {
      const value = form.get(field);
      if (typeof value === "string" && value.trim() !== "") {
        payload[field] = value.trim();
      }
    }

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();

      if (response.status === 201) {
        setState({ status: "success", leadId: body.lead.id });
        router.refresh();
        return;
      }
      if (response.status === 409) {
        setState({ status: "duplicate", leadId: body.existing_lead_id, message: "This company already exists." });
        return;
      }
      if (response.status === 400) {
        setState({
          status: "error",
          fieldErrors: body.error?.details?.fieldErrors,
          message: body.error?.details?.formErrors?.[0] ?? "Please check the fields below.",
        });
        return;
      }
      setState({ status: "error", message: "Something went wrong creating the lead. Please try again." });
    } catch {
      setState({ status: "error", message: "Could not reach the server. Please try again." });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
      >
        <IconPlus className="h-3.5 w-3.5" />
        Add lead
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-16 backdrop-blur-sm">
          <div
            className="w-full max-w-md animate-rise-in rounded-lg border border-border-strong bg-surface p-5"
            style={{ boxShadow: "var(--elevation-lg)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Add lead</h2>
              <button
                type="button"
                onClick={close}
                className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface-hover hover:text-foreground"
                aria-label="Close"
              >
                <IconClose className="h-3.5 w-3.5" />
              </button>
            </div>

            {state.status === "success" && state.leadId ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-foreground">Lead created and queued for processing.</p>
                <div className="flex gap-2">
                  <Link
                    href={`/leads/${state.leadId}`}
                    className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground"
                    onClick={close}
                  >
                    View lead
                  </Link>
                  <button
                    type="button"
                    onClick={() => setState(INITIAL_STATE)}
                    className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:border-border-strong"
                  >
                    Add another
                  </button>
                </div>
              </div>
            ) : state.status === "duplicate" ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-foreground">{state.message}</p>
                <div className="flex gap-2">
                  <Link
                    href={`/leads/${state.leadId}`}
                    className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground"
                    onClick={close}
                  >
                    View existing lead
                  </Link>
                  <button
                    type="button"
                    onClick={() => setState(INITIAL_STATE)}
                    className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:border-border-strong"
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <Field name="company_name" label="Company name" required errors={state.fieldErrors?.company_name} />
                <Field name="website" label="Website" placeholder="acme.com" errors={state.fieldErrors?.website} />
                <Field name="contact_name" label="Contact name" errors={state.fieldErrors?.contact_name} />
                <Field name="email" label="Email" type="email" errors={state.fieldErrors?.email} />
                <Field name="linkedin_url" label="LinkedIn URL" errors={state.fieldErrors?.linkedin_url} />
                <div className="grid grid-cols-2 gap-3">
                  <Field name="industry" label="Industry" errors={state.fieldErrors?.industry} />
                  <Field name="country" label="Country" errors={state.fieldErrors?.country} />
                </div>

                {state.status === "error" && state.message ? (
                  <p className="text-sm" style={{ color: "var(--status-failed)" }}>
                    {state.message}
                  </p>
                ) : null}

                <div className="mt-1 flex justify-end gap-2 border-t border-border pt-3.5">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:border-border-strong"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={state.status === "submitting"}
                    className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {state.status === "submitting" ? "Adding…" : "Add lead"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function Field({
  name,
  label,
  type = "text",
  required = false,
  placeholder,
  errors,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  errors?: string[];
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="h-9 rounded-md border border-border bg-surface-muted px-2.5 text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25"
      />
      {errors?.map((error) => (
        <span key={error} className="text-xs" style={{ color: "var(--status-failed)" }}>
          {error}
        </span>
      ))}
    </label>
  );
}
