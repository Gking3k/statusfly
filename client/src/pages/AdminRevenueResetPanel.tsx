import { useState } from "react";
import type { FormEvent } from "react";
import {
  getAdminSessionToken,
  resetAdminRevenueReporting,
} from "../api/admin";

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function AdminRevenueResetPanel({
  onReset,
  onLoggedOut,
}: {
  onReset?: () => void | Promise<void>;
  onLoggedOut?: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (reason.trim().length < 3) {
      setError("Enter a reason of at least 3 characters for the audit log.");
      return;
    }

    const confirmed = window.confirm(
      "Reset the Overview Net revenue reporting baseline to now? The Overview Net revenue card will start from zero across the 7-day, 30-day, and All time views. Payment records, refund records, payment statuses, Purchases, and the All-time net revenue figure in Money & feedback will not be changed.",
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      const result = await resetAdminRevenueReporting({
        reason: reason.trim(),
        confirmed: true,
      });
      setReason("");
      setSuccess(`Net revenue reporting reset at ${displayDate(result.resetAt)}. Financial records were preserved.`);
      await onReset?.();
    } catch (resetError) {
      if (!getAdminSessionToken()) onLoggedOut?.();
      setError(resetError instanceof Error ? resetError.message : "Unable to reset net revenue reporting.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-analytics-reset" aria-label="Net revenue reporting reset controls">
      <div className="admin-analytics-reset-heading">
        <div>
          <span className="admin-kicker">Revenue reporting</span>
          <h2>Reset net revenue to zero</h2>
          <p>Start a new reporting baseline for the Net revenue card in the Overview. This action does not change purchases or underlying financial records.</p>
        </div>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)}>
        <label className="admin-analytics-reset-reason">
          <span>Reason for reset (required)</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={3}
            maxLength={1000}
            rows={2}
            placeholder="e.g. Starting a clean revenue reporting period after launch testing"
            disabled={saving}
            required
          />
        </label>

        <div className="admin-analytics-reset-footer">
          <p>Only the Overview Net revenue reporting baseline is reset. Existing payment and refund records remain unchanged. The Purchases card and All-time net revenue under Money & feedback continue to show their existing figures.</p>
          <button type="submit" className="button button-primary" disabled={saving || reason.trim().length < 3}>
            {saving ? "Saving reset…" : "Reset net revenue"}
            <span className="button-accent">↻</span>
          </button>
        </div>

        {error ? <div className="admin-error admin-analytics-reset-message" role="alert">{error}</div> : null}
        {success ? <div className="admin-analytics-reset-success" role="status">{success}</div> : null}
      </form>
    </section>
  );
}
