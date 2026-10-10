import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminProductPagesPanel from "./AdminProductPagesPanel";
import AdminPaymentsPanel from "./AdminPaymentsPanel";
import AdminAnalyticsResetPanel from "./AdminAnalyticsResetPanel";
import AdminRevenueResetPanel from "./AdminRevenueResetPanel";
import {
  clearAdminSessionToken,
  getAdminAnalytics,
  getAdminAuditLog,
  getAdminSessionToken,
  loginAdmin,
  type AdminAnalytics,
  type AdminAnalyticsRange,
  type AdminAuditEvent,
} from "../api/admin";

function formatNaira(value: number) {
  return `₦${value.toLocaleString("en-NG", {
    minimumFractionDigits: value % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function rangeLabel(range: AdminAnalyticsRange) {
  if (range === "7d") return "Last 7 days";
  if (range === "30d") return "Last 30 days";
  return "All time";
}

function AdminLogin({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await loginAdmin(username, password);
      onLoggedIn();
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Unable to sign in.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-page admin-login-page">
      <div className="admin-login-card">
        <Link className="brand brand-mark" to="/">
          StatusFly
        </Link>

        <span className="admin-kicker">Owner access</span>
        <h1>Your StatusFly dashboard.</h1>
        <p>
          Private platform analytics for the StatusFly owner. Seller insights
          remain separate from this dashboard.
        </p>

        <form className="admin-login-form" onSubmit={handleSubmit}>
          <label>
            <span>Username</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
              disabled={submitting}
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              disabled={submitting}
            />
          </label>

          {error ? (
            <p className="admin-error" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className="button button-primary admin-login-button"
            disabled={submitting}
          >
            {submitting ? "Signing in…" : "Open admin dashboard"}
            <span className="button-accent">→</span>
          </button>
        </form>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  description,
  primary = false,
}: {
  label: string;
  value: string;
  description: string;
  primary?: boolean;
}) {
  return (
    <article className={`admin-metric-card ${primary ? "primary" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{description}</p>
    </article>
  );
}

function FunnelStep({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 4;

  return (
    <div className="admin-funnel-step">
      <div className="admin-funnel-topline">
        <span>{label}</span>
        <strong>{value.toLocaleString("en-NG")}</strong>
      </div>
      <div className="admin-funnel-track">
        <div className="admin-funnel-fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function AdminDashboard({ onLoggedOut }: { onLoggedOut: () => void }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"overview" | "product-pages" | "payments">("overview");
  const [range, setRange] = useState<AdminAnalyticsRange>("30d");
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [auditEvents, setAuditEvents] = useState<AdminAuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setAnalytics(await getAdminAnalytics(range));

      setAuditLoading(true);
      try {
        setAuditEvents(await getAdminAuditLog(20));
        setAuditError("");
      } catch (auditLoadError) {
        if (!getAdminSessionToken()) {
          onLoggedOut();
          return;
        }
        setAuditError(
          auditLoadError instanceof Error
            ? auditLoadError.message
            : "Unable to load admin activity.",
        );
      } finally {
        setAuditLoading(false);
      }
    } catch (loadError) {
      if (!getAdminSessionToken()) {
        onLoggedOut();
        return;
      }

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load StatusFly analytics.",
      );
    } finally {
      setLoading(false);
    }
  }, [navigate, onLoggedOut, range]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleLogout() {
    clearAdminSessionToken();
    navigate("/admin", { replace: true });
  }

  if (loading && !analytics && activeTab === "overview") {
    return (
      <main className="admin-page admin-state-page">
        <div className="admin-state-card">
          <span className="admin-kicker">StatusFly admin</span>
          <div className="admin-loading-mark" />
          <h1>Loading your dashboard.</h1>
          <p>Gathering platform activity from the database.</p>
        </div>
      </main>
    );
  }

  if ((error || !analytics) && activeTab === "overview") {
    return (
      <main className="admin-page admin-state-page">
        <div className="admin-state-card">
          <span className="admin-kicker">StatusFly admin</span>
          <h1>We couldn't load the dashboard.</h1>
          <p>{error || "Analytics are unavailable right now."}</p>
          <div className="admin-state-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={() => void load()}
            >
              Try again
              <span className="button-accent">↻</span>
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setActiveTab("product-pages")}
            >
              Open product-page manager
              <span className="button-accent">→</span>
            </button>
          </div>
        </div>
      </main>
    );
  }

  const visitorMax = analytics
    ? Math.max(
        analytics.visitors.unique,
        analytics.visitors.homeViews,
        analytics.visitors.createViews,
        analytics.funnel.draftsCreated,
        analytics.funnel.paymentStarts,
        analytics.funnel.successfulPayments,
      )
    : 0;

  return (
    <main className="admin-page">
      <div className="admin-shell">
        <header className="admin-topbar">
          <div className="admin-topbar-brand">
            <Link className="brand brand-mark" to="/">
              StatusFly
            </Link>
            <span className="admin-divider">/</span>
            <span>Owner dashboard</span>
          </div>

          <div className="admin-topbar-actions">
            <span className="admin-live-note">Private</span>
            <button
              type="button"
              className="admin-logout"
              onClick={handleLogout}
            >
              Log out
            </button>
          </div>
        </header>

        <nav className="admin-primary-tabs" aria-label="Admin sections">
          <button
            type="button"
            className={activeTab === "overview" ? "active" : ""}
            aria-current={activeTab === "overview" ? "page" : undefined}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            className={activeTab === "product-pages" ? "active" : ""}
            aria-current={activeTab === "product-pages" ? "page" : undefined}
            onClick={() => setActiveTab("product-pages")}
          >
            Product pages
          </button>
          <button
            type="button"
            className={activeTab === "payments" ? "active" : ""}
            aria-current={activeTab === "payments" ? "page" : undefined}
            onClick={() => setActiveTab("payments")}
          >
            Payments &amp; refunds
          </button>
        </nav>

        {activeTab === "overview" && analytics ? (
          <>
        <section className="admin-heading">
          <div>
            <span className="admin-kicker">Platform performance</span>
            <h1>See what StatusFly is doing.</h1>
            <p>
              Track discovery, page creation, payments and product-page usage
              across the whole platform. This view is for you only.
            </p>
          </div>

          <div className="admin-range-control">
            <span>Activity period</span>
            <div className="admin-range-buttons">
              {(["7d", "30d", "all"] as AdminAnalyticsRange[]).map(
                (option) => (
                  <button
                    key={option}
                    type="button"
                    className={range === option ? "active" : ""}
                    onClick={() => setRange(option)}
                    disabled={loading}
                  >
                    {rangeLabel(option)}
                  </button>
                ),
              )}
            </div>
          </div>
        </section>

        <section className="admin-metrics-grid" aria-label="StatusFly overview">
          <MetricCard
            primary
            label="Unique visitors"
            value={analytics.visitors.unique.toLocaleString("en-NG")}
            description={`Distinct anonymous visitors seen in ${rangeLabel(range).toLowerCase()}.`}
          />
          <MetricCard
            label="Published pages"
            value={analytics.business.totalPublishedPages.toLocaleString("en-NG")}
            description="Product pages currently live on StatusFly."
          />
          <MetricCard
            label="Purchases"
            value={analytics.funnel.successfulPayments.toLocaleString("en-NG")}
            description={`${rangeLabel(range)} successful product-page payments.`}
          />
          <MetricCard
            label="Net revenue"
            value={formatNaira(analytics.business.periodRevenueNaira)}
            description={`${rangeLabel(range)} net successful payments minus refunds processed since the current reporting baseline or period start, whichever is later. Pending refunds are not deducted yet.`}
          />
        </section>

        <AdminRevenueResetPanel onReset={load} onLoggedOut={onLoggedOut} />

        <section className="admin-section-grid">
          <article className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span className="admin-kicker">Conversion</span>
                <h2>Create → pay → publish</h2>
              </div>
              <span>{rangeLabel(range)}</span>
            </div>

            <div className="admin-funnel">
              <FunnelStep
                label="Visitors"
                value={analytics.visitors.unique}
                max={visitorMax}
              />
              <FunnelStep
                label="Created a draft"
                value={analytics.funnel.draftsCreated}
                max={visitorMax}
              />
              <FunnelStep
                label="Started payment"
                value={analytics.funnel.paymentStarts}
                max={visitorMax}
              />
              <FunnelStep
                label="Paid successfully"
                value={analytics.funnel.successfulPayments}
                max={visitorMax}
              />
            </div>

            <div className="admin-secondary-metrics">
              <div>
                <span>Payment setup failures</span>
                <strong>{analytics.funnel.paymentInitFailures}</strong>
              </div>
              <div>
                <span>Pages live</span>
                <strong>{analytics.business.totalPublishedPages}</strong>
              </div>
            </div>
          </article>

          <article className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span className="admin-kicker">Product activity</span>
                <h2>Are paid pages being used?</h2>
              </div>
            </div>

            <div className="admin-activity-grid">
              <div>
                <span>Product-page views</span>
                <strong>{analytics.productActivity.pageViews.toLocaleString("en-NG")}</strong>
              </div>
              <div>
                <span>WhatsApp clicks</span>
                <strong>{analytics.productActivity.whatsappClicks.toLocaleString("en-NG")}</strong>
              </div>
              <div>
                <span>Shares</span>
                <strong>{analytics.productActivity.shareClicks.toLocaleString("en-NG")}</strong>
              </div>
              <div>
                <span>Public-page opens</span>
                <strong>{analytics.visitors.publicProductPageViews.toLocaleString("en-NG")}</strong>
              </div>
            </div>
            <p className="admin-activity-footnote">
              WhatsApp click-through rate: {analytics.productActivity.pageViews > 0
                ? ((analytics.productActivity.whatsappClicks / analytics.productActivity.pageViews) * 100).toFixed(1)
                : "0.0"}% of product-page views generated a WhatsApp click in this period.
            </p>
          </article>
        </section>

        <section className="admin-section-grid">
          <article className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span className="admin-kicker">Popular pages</span>
                <h2>Pages getting attention</h2>
              </div>
            </div>

            {analytics.topProducts.length ? (
              <div className="admin-product-list">
                {analytics.topProducts.map((product) => (
                  <Link
                    key={product.publicSlug}
                    className="admin-product-row"
                    to={`/p/${product.publicSlug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <div>
                      <strong>{product.productName}</strong>
                      <span>{product.brandName}</span>
                    </div>
                    <div className="admin-product-stats">
                      <span>{product.pageViews} views</span>
                      <span>{product.whatsappClicks} WhatsApp</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="admin-empty-state">No published product activity yet.</div>
            )}
          </article>

          <article className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span className="admin-kicker">Business</span>
                <h2>Money & feedback</h2>
              </div>
            </div>

            <div className="admin-business-list">
              <div>
                <span>All-time net revenue</span>
                <strong>{formatNaira(analytics.business.totalRevenueNaira)}</strong>
              </div>
              <div>
                <span>Gross successful payments</span>
                <strong>{formatNaira(analytics.business.totalGrossRevenueNaira)}</strong>
              </div>
              <div>
                <span>Processed refunds</span>
                <strong>{formatNaira(analytics.business.totalProcessedRefundNaira)}</strong>
              </div>
              <div>
                <span>Refunds in progress</span>
                <strong>{formatNaira(analytics.business.totalPendingRefundNaira)}</strong>
              </div>
              <div>
                <span>Successful payments</span>
                <strong>{analytics.business.totalSuccessfulPayments.toLocaleString("en-NG")}</strong>
              </div>
              <div>
                <span>Feedback this period</span>
                <strong>{analytics.business.periodFeedbackCount.toLocaleString("en-NG")}</strong>
              </div>
              <div>
                <span>Average rating</span>
                <strong>
                  {analytics.business.periodAverageRating === null
                    ? "—"
                    : `${analytics.business.periodAverageRating}/5`}
                </strong>
              </div>
            </div>
          </article>
        </section>

        <section className="admin-section-grid">
          <article className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span className="admin-kicker">Payments</span>
                <h2>Recent transactions</h2>
              </div>
            </div>

            {analytics.recentPayments.length ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.recentPayments.map((payment) => (
                      <tr key={payment.reference}>
                        <td>
                          <strong>{payment.productName}</strong>
                          <span>{payment.customerEmail || payment.brandName}</span>
                        </td>
                        <td>{formatNaira(payment.amountNaira)}</td>
                        <td>
                          <span className={`admin-status admin-status-${payment.status}`}>
                            {payment.status}
                          </span>
                        </td>
                        <td>{formatDate(payment.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-empty-state">No payment activity for this period.</div>
            )}
          </article>

          <article className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span className="admin-kicker">Feedback</span>
                <h2>Latest customer voice</h2>
              </div>
            </div>

            {analytics.recentFeedback.length ? (
              <div className="admin-feedback-list">
                {analytics.recentFeedback.map((feedback, index) => (
                  <article
                    className="admin-feedback-item"
                    key={`${feedback.createdAt}-${index}`}
                  >
                    <div className="admin-feedback-topline">
                      <strong>{"★".repeat(feedback.rating)}</strong>
                      <span>{formatDate(feedback.createdAt)}</span>
                    </div>
                    <p>
                      {feedback.improvementText ||
                        feedback.featureRequest ||
                        feedback.outcome ||
                        "No written comment."}
                    </p>
                    {feedback.productName ? (
                      <small>
                        {feedback.productName} · {feedback.brandName}
                      </small>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="admin-empty-state">No feedback for this period.</div>
            )}
          </article>
        </section>


        <AdminAnalyticsResetPanel
          scopeType="platform"
          onReset={load}
          onLoggedOut={onLoggedOut}
        />

        <section className="admin-section-grid admin-audit-section">
          <article className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span className="admin-kicker">Security & accountability</span>
                <h2>Recent admin activity</h2>
              </div>
              <span>Latest 20 events</span>
            </div>

            {auditLoading ? (
              <div className="admin-empty-state">Loading admin activity…</div>
            ) : auditError ? (
              <div className="admin-empty-state admin-audit-error" role="status">
                {auditError}
              </div>
            ) : auditEvents.length ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Outcome</th>
                      <th>Reason</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditEvents.map((event) => (
                      <tr key={event.id}>
                        <td>
                          <strong>{event.action.replace(/[._]/g, " ")}</strong>
                          <span>{event.actorUsername}</span>
                        </td>
                        <td>
                          <strong>{event.entityType.replace(/_/g, " ")}</strong>
                          {event.entityId ? <span>{event.entityId}</span> : null}
                        </td>
                        <td>
                          <span className={`admin-status admin-status-${event.outcome}`}>
                            {event.outcome}
                          </span>
                        </td>
                        <td>{event.reason || "—"}</td>
                        <td>{formatDate(event.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-empty-state">
                No admin actions recorded yet. Successful sign-ins and future page, payment, refund and analytics changes will appear here.
              </div>
            )}
          </article>
        </section>

        <footer className="admin-footer">
          <span>
            Data refreshed {formatDate(analytics.generatedAt)} · {rangeLabel(range)}
          </span>
          <span>Anonymous visitor IDs are used only for aggregate platform analytics.</span>
        </footer>
          </>
        ) : activeTab === "product-pages" ? (
          <AdminProductPagesPanel onLoggedOut={onLoggedOut} />
        ) : (
          <AdminPaymentsPanel onLoggedOut={onLoggedOut} />
        )}
      </div>
    </main>
  );
}

function AdminPage() {
  useEffect(() => {
    document.title = "StatusFly Admin";

    let robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }

    const previousContent = robots.content;
    robots.content = "noindex,nofollow,noarchive";

    return () => {
      robots.content = previousContent;
      document.title = "StatusFly";
    };
  }, []);

  const [authenticated, setAuthenticated] = useState(
    Boolean(getAdminSessionToken()),
  );

  return authenticated ? (
    <AdminDashboard onLoggedOut={() => setAuthenticated(false)} />
  ) : (
    <AdminLogin onLoggedIn={() => setAuthenticated(true)} />
  );
}

export default AdminPage;
