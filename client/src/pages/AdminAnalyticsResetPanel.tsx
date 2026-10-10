import { useState } from "react";
import type { FormEvent } from "react";
import {
  getAdminSessionToken,
  resetAdminAnalytics,
  type AdminAnalyticsResetMetric,
  type AdminAnalyticsResetScope,
} from "../api/admin";

interface MetricOption {
  key: AdminAnalyticsResetMetric;
  label: string;
  description: string;
}

const PLATFORM_METRICS: MetricOption[] = [
  { key: "unique_visitors", label: "Unique visitors", description: "Distinct anonymous visitors counted from the selected baseline." },
  { key: "home_views", label: "Homepage views", description: "Visits recorded on the StatusFly homepage." },
  { key: "create_views", label: "Create-page views", description: "Visits to the product-page creation flow." },
  { key: "drafts_created", label: "Drafts created", description: "Product-page drafts recorded by platform analytics." },
  { key: "payment_starts", label: "Payment starts", description: "Payment attempts initiated in the product-page checkout flow." },
  { key: "payment_init_failures", label: "Payment setup failures", description: "Checkout attempts that failed during payment initialization." },
  { key: "public_product_page_views", label: "Public product-page views", description: "Public product-page views counted by platform analytics." },
  { key: "product_page_views", label: "Product-page views", description: "Views recorded on all individual product pages." },
  { key: "whatsapp_clicks", label: "WhatsApp clicks", description: "Clicks on product pages' WhatsApp order links." },
  { key: "share_clicks", label: "Share clicks", description: "Share actions recorded on product pages." },
];

const PAGE_METRICS: MetricOption[] = [
  { key: "product_page_views", label: "Page views", description: "Reset displayed view counts for this page." },
  { key: "whatsapp_clicks", label: "WhatsApp clicks", description: "Reset displayed WhatsApp click counts for this page." },
  { key: "share_clicks", label: "Share clicks", description: "Reset displayed share counts for this page." },
];

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function AdminAnalyticsResetPanel({
  scopeType,
  scopeId,
  title,
  description,
  onReset,
  onLoggedOut,
  compact = false,
}: {
  scopeType: AdminAnalyticsResetScope;
  scopeId?: string;
  title?: string;
  description?: string;
  onReset?: () => void | Promise<void>;
  onLoggedOut?: () => void;
  compact?: boolean;
}) {
  const [selected, setSelected] = useState<AdminAnalyticsResetMetric[]>([]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const options = scopeType === "platform" ? PLATFORM_METRICS : PAGE_METRICS;
  const scopeValid = scopeType === "platform" || Boolean(scopeId);

  function toggleMetric(key: AdminAnalyticsResetMetric, checked: boolean) {
    setSelected((current) => checked
      ? [...current, key]
      : current.filter((item) => item !== key));
    setSuccess("");
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!scopeValid) {
      setError("This product page is not available for an analytics reset.");
      return;
    }
    if (!selected.length) {
      setError("Select at least one statistic to reset.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Enter a reason of at least 3 characters for the audit log.");
      return;
    }

    const scopeLabel = scopeType === "platform" ? "platform-wide" : "this product page's";
    const metricLabel = selected.map((key) => options.find((item) => item.key === key)?.label ?? key).join(", ");
    const confirmed = window.confirm(
      `Reset ${metricLabel} for ${scopeLabel} reporting from now on? Historical events will remain stored. Payment records, refunds, revenue, and feedback will not be changed.`,
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      const result = await resetAdminAnalytics({
        scopeType,
        ...(scopeType === "product_page" && scopeId ? { scopeId } : {}),
        metricKeys: selected,
        reason: reason.trim(),
      });
      setSelected([]);
      setReason("");
      setSuccess(`Selected statistics reset at ${displayDate(result.resetAt)}. Historical events and financial records were preserved.`);
      await onReset?.();
    } catch (resetError) {
      if (!getAdminSessionToken()) onLoggedOut?.();
      setError(resetError instanceof Error ? resetError.message : "Unable to reset selected statistics.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`admin-analytics-reset${compact ? " admin-analytics-reset-compact" : ""}`} aria-label={title ?? "Analytics reset controls"}>
      <div className="admin-analytics-reset-heading">
        <div>
          <span className="admin-kicker">Analytics controls</span>
          <h2>{title ?? (scopeType === "platform" ? "Reset selected platform statistics" : "Reset this page's statistics")}</h2>
          <p>{description ?? (scopeType === "platform"
            ? "Choose which reporting counters should start from zero. Resetting product-page views, WhatsApp clicks, or shares applies across every product page's displayed insights too."
            : "Choose which counters for this page should start from zero. The new baseline also applies to the seller's displayed insights for this page.")}</p>
        </div>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className="admin-analytics-reset-options">
          {options.map((metric) => (
            <label className="admin-analytics-reset-option" key={metric.key}>
              <input
                type="checkbox"
                checked={selected.includes(metric.key)}
                onChange={(event) => toggleMetric(metric.key, event.target.checked)}
                disabled={saving}
              />
              <span>
                <strong>{metric.label}</strong>
                <small>{metric.description}</small>
              </span>
            </label>
          ))}
        </div>

        <label className="admin-analytics-reset-reason">
          <span>Reason for reset (required)</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={3}
            maxLength={1000}
            rows={2}
            placeholder="e.g. Starting a clean reporting period after launch testing"
            disabled={saving}
            required
          />
        </label>

        <div className="admin-analytics-reset-footer">
          <p>Old event records remain in the database. Revenue, payment statuses, refunds, and customer feedback cannot be reset here.</p>
          <button type="submit" className="button button-primary" disabled={saving || !scopeValid || selected.length === 0 || reason.trim().length < 3}>
            {saving ? "Saving reset…" : "Reset selected stats"}
            <span className="button-accent">↻</span>
          </button>
        </div>

        {error ? <div className="admin-error admin-analytics-reset-message" role="alert">{error}</div> : null}
        {success ? <div className="admin-analytics-reset-success" role="status">{success}</div> : null}
      </form>
    </section>
  );
}
