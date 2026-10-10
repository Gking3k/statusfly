import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  getAdminPaymentDetail,
  getAdminPayments,
  getAdminSessionToken,
  initiateAdminRefund,
  refreshAdminRefund,
  verifyAdminPayment,
  type AdminManagedPayment,
  type AdminManagedPaymentStatusFilter,
  type AdminManagedRefund,
  type AdminPaymentDetailResponse,
  type AdminPaymentsResponse,
} from "../api/admin";

function formatNaira(value: number) {
  return `₦${value.toLocaleString("en-NG", {
    minimumFractionDigits: value % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function koboToNaira(value: number) {
  return value / 100;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function prettyStatus(value: string | null | undefined) {
  if (!value) return "No refunds";
  if (value === "initiation_unknown") return "Needs reconciliation";
  return value.replace(/[-_]/g, " ");
}

function statusClass(value: string) {
  return `admin-status admin-status-${value.replace(/[^a-z0-9_-]/gi, "-")}`;
}

function toKobo(value: string): number | null {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100_000_000) return null;
  const kobo = Math.round(parsed * 100);
  return Number.isSafeInteger(kobo) && kobo > 0 ? kobo : null;
}

function createRequestId() {
  return window.crypto.randomUUID();
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  danger = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`admin-page-action${danger ? " danger" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export default function AdminPaymentsPanel({
  onLoggedOut,
}: {
  onLoggedOut: () => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AdminManagedPaymentStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminPaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const [selectedReference, setSelectedReference] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminPaymentDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [actionError, setActionError] = useState("");
  const [amountNaira, setAmountNaira] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [requestId, setRequestId] = useState(createRequestId);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      setData(await getAdminPayments({ q: search, status, page, pageSize: 20 }));
    } catch (error) {
      if (!getAdminSessionToken()) {
        onLoggedOut();
        return;
      }
      setListError(error instanceof Error ? error.message : "Unable to load payment records.");
    } finally {
      setLoading(false);
    }
  }, [onLoggedOut, page, reloadCount, search, status]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  async function openPayment(reference: string) {
    setSelectedReference(reference);
    setDetail(null);
    setActionError("");
    setNotice("");
    setAmountNaira("");
    setRefundReason("");
    setRequestId(createRequestId());
    setDetailLoading(true);
    try {
      setDetail(await getAdminPaymentDetail(reference));
    } catch (error) {
      if (!getAdminSessionToken()) {
        onLoggedOut();
        return;
      }
      setActionError(error instanceof Error ? error.message : "Unable to load payment details.");
    } finally {
      setDetailLoading(false);
    }
  }

  function closePayment() {
    setSelectedReference(null);
    setDetail(null);
    setActionError("");
    setBusyAction("");
  }

  async function verifyPayment() {
    if (!detail) return;
    setBusyAction("verify");
    setActionError("");
    setNotice("");
    try {
      const result = await verifyAdminPayment(detail.payment.reference);
      setDetail({ payment: result.payment, refunds: result.refunds });
      setNotice(result.verification.message);
      setNoticeIsError(!result.verification.matched || result.verification.outcome === "manual_review");
      setReloadCount((value) => value + 1);
    } catch (error) {
      if (!getAdminSessionToken()) {
        onLoggedOut();
        return;
      }
      setActionError(error instanceof Error ? error.message : "Unable to verify payment with Paystack.");
    } finally {
      setBusyAction("");
    }
  }

  async function submitRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const amountKobo = toKobo(amountNaira);
    if (amountKobo === null) {
      setActionError("Enter a valid amount in naira, with no more than two decimal places.");
      return;
    }
    if (amountKobo > detail.payment.refundableKobo) {
      setActionError(`The maximum currently refundable amount is ${formatNaira(koboToNaira(detail.payment.refundableKobo))}.`);
      return;
    }
    if (refundReason.trim().length < 3) {
      setActionError("Enter a reason of at least 3 characters.");
      return;
    }
    if (!window.confirm(
      `Initiate a ${formatNaira(koboToNaira(amountKobo))} refund through Paystack for ${detail.payment.reference}? This sends a real refund request if Paystack is configured for live payments.`,
    )) return;

    setBusyAction("refund");
    setActionError("");
    setNotice("");
    try {
      const result = await initiateAdminRefund({
        reference: detail.payment.reference,
        amountKobo,
        reason: refundReason.trim(),
        requestId,
      });
      setDetail(result.payment ?? await getAdminPaymentDetail(detail.payment.reference));
      setNotice(result.replayed
        ? `This request ID already exists. No second refund was sent; current status: ${prettyStatus(result.refund.status)}.`
        : `Paystack accepted the refund request. Current status: ${prettyStatus(result.refund.status)}. This does not necessarily mean the customer has received the funds yet.`);
      setNoticeIsError(result.refund.status === "initiation_unknown" || result.refund.status === "failed");
      setAmountNaira("");
      setRefundReason("");
      setRequestId(createRequestId());
      setReloadCount((value) => value + 1);
    } catch (error) {
      if (!getAdminSessionToken()) {
        onLoggedOut();
        return;
      }
      setActionError(error instanceof Error ? error.message : "Unable to initiate refund.");
      // If Paystack accepted a request but the network response was lost, reload
      // the local reservation so an uncertain refund cannot be submitted twice.
      try {
        const refreshedDetail = await getAdminPaymentDetail(detail.payment.reference);
        setDetail(refreshedDetail);
        setReloadCount((value) => value + 1);
        const latestRefund = refreshedDetail.refunds[0];
        // An explicit provider rejection is recorded as failed, so a deliberate
        // retry gets a fresh idempotency key. Uncertain requests keep the same
        // key and remain reserved; never retry them blindly.
        if (
          latestRefund?.status === "failed" &&
          latestRefund.amountKobo === amountKobo &&
          latestRefund.reason === refundReason.trim()
        ) {
          setRequestId(createRequestId());
        }
      } catch {
        // Keep the original error visible; do not retry the provider request.
      }
    } finally {
      setBusyAction("");
    }
  }

  async function refreshRefund(refund: AdminManagedRefund) {
    setBusyAction(`refresh:${refund.id}`);
    setActionError("");
    try {
      const result = await refreshAdminRefund(refund.id);
      if (result.payment) setDetail(result.payment);
      setNotice(`Paystack refund status refreshed: ${prettyStatus(result.refund.status)}.`);
      setNoticeIsError(result.refund.status === "failed" || result.refund.status === "needs-attention");
      setReloadCount((value) => value + 1);
    } catch (error) {
      if (!getAdminSessionToken()) {
        onLoggedOut();
        return;
      }
      setActionError(error instanceof Error ? error.message : "Unable to refresh refund status.");
    } finally {
      setBusyAction("");
    }
  }

  const payments = data?.payments ?? [];
  const pagination = data?.pagination;
  const summary = data?.summary;
  const selectedPayment: AdminManagedPayment | null = detail?.payment ?? null;

  return (
    <section className="admin-product-pages admin-admin-payments">
      <div className="admin-product-pages-heading">
        <div>
          <span className="admin-kicker">Platform finances</span>
          <h1>Payments &amp; refunds.</h1>
          <p>Verify transactions against Paystack, review refund history and reconcile net revenue without rewriting original payment records.</p>
        </div>
        <div className="admin-page-manager-count">
          <strong>{summary?.paymentCount.toLocaleString("en-NG") ?? "—"}</strong>
          <span>transactions</span>
        </div>
      </div>

      <div className="admin-payment-summary" aria-label="Payment summary">
        <article><span>Successful payment value</span><strong>{summary ? formatNaira(koboToNaira(summary.grossRevenueKobo)) : "—"}</strong></article>
        <article><span>Processed refunds</span><strong>{summary ? formatNaira(koboToNaira(summary.processedRefundKobo)) : "—"}</strong></article>
        <article><span>Net successful revenue</span><strong>{summary ? formatNaira(koboToNaira(summary.netRevenueKobo)) : "—"}</strong></article>
        <article><span>Refunds in progress</span><strong>{summary ? formatNaira(koboToNaira(summary.pendingRefundKobo)) : "—"}</strong></article>
      </div>

      <article className="admin-page-manager-panel">
        <div className="admin-page-manager-toolbar">
          <label className="admin-page-search">
            <span>Search transactions</span>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Reference, customer email, product or brand"
              maxLength={100}
            />
          </label>
          <label className="admin-page-status-filter">
            <span>Payment status</span>
            <select value={status} onChange={(event) => { setStatus(event.target.value as AdminManagedPaymentStatusFilter); setPage(1); }}>
              <option value="all">All payments</option>
              <option value="success">Successful</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="invalid">Flagged invalid</option>
            </select>
          </label>
        </div>

        {notice ? <div className={`admin-page-notice${noticeIsError ? " admin-payment-notice-warning" : ""}`} role="status">{notice}</div> : null}
        {listError ? <div className="admin-error admin-page-inline-error" role="alert">{listError}</div> : null}

        {loading ? <div className="admin-empty-state">Loading payment records…</div> : listError ? null : payments.length ? (
          <div className="admin-table-wrap admin-managed-pages-table-wrap">
            <table className="admin-table admin-managed-pages-table admin-payments-table">
              <thead><tr><th>Payment</th><th>Status</th><th>Amount</th><th>Refunds</th><th>Created</th><th>Manage</th></tr></thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <strong>{payment.reference}</strong>
                      <span>{payment.productName} · {payment.brandName}</span>
                      <small className="admin-managed-page-slug">{payment.customerEmail || "No customer email"}</small>
                    </td>
                    <td><span className={statusClass(payment.status)}>{payment.status}</span></td>
                    <td><strong>{formatNaira(koboToNaira(payment.amountKobo))}</strong><span>{payment.currency}</span></td>
                    <td>
                      <strong>{formatNaira(koboToNaira(payment.processedRefundKobo))} processed</strong>
                      <span>{payment.pendingRefundKobo ? `${formatNaira(koboToNaira(payment.pendingRefundKobo))} in progress` : payment.latestRefundStatus ? prettyStatus(payment.latestRefundStatus) : "No refunds"}</span>
                    </td>
                    <td>{formatDate(payment.createdAt)}</td>
                    <td><ActionButton disabled={Boolean(busyAction)} onClick={() => void openPayment(payment.reference)}>Inspect</ActionButton></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="admin-empty-state">No payments match these filters.</div>}

        <div className="admin-page-pagination">
          <span>{pagination ? `Page ${pagination.page} of ${pagination.totalPages}` : "—"}</span>
          <div>
            <ActionButton disabled={!pagination || page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</ActionButton>
            <ActionButton disabled={!pagination || page >= pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</ActionButton>
          </div>
        </div>
        <p className="admin-page-manager-footnote">Original payment amounts and payment references are read-only. Refunds are separate audited records. “In progress” amounts remain reserved, and a processed refund may take additional time to reach the customer.</p>
      </article>

      {selectedReference ? (
        <div className="admin-detail-backdrop admin-payment-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyAction) closePayment(); }}>
          <section className="admin-detail-dialog admin-payment-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-payment-detail-title">
            <header className="admin-detail-header">
              <div><span className="admin-kicker">Transaction details</span><h2 id="admin-payment-detail-title">{selectedPayment?.reference ?? "Inspect payment"}</h2></div>
              <button type="button" className="admin-detail-close" onClick={closePayment} disabled={Boolean(busyAction)} aria-label="Close payment details">×</button>
            </header>

            {detailLoading ? <div className="admin-empty-state">Loading payment details…</div> : detail && selectedPayment ? (
              <>
                <div className="admin-detail-status-line">
                  <span className={statusClass(selectedPayment.status)}>{selectedPayment.status}</span>
                  <span>{selectedPayment.productName} · {selectedPayment.brandName}</span>
                  <strong>{formatNaira(koboToNaira(selectedPayment.amountKobo))}</strong>
                </div>

                {notice ? <div className={`admin-page-notice${noticeIsError ? " admin-payment-notice-warning" : ""}`} role="status">{notice}</div> : null}
                {actionError ? <div className="admin-error admin-page-inline-error" role="alert">{actionError}</div> : null}

                <dl className="admin-detail-fields admin-payment-fields">
                  <div><dt>Customer email</dt><dd>{selectedPayment.customerEmail || "—"}</dd></div>
                  <div><dt>Product page</dt><dd><a href={`/p/${selectedPayment.publicSlug}`} target="_blank" rel="noreferrer">/p/{selectedPayment.publicSlug} ↗</a></dd></div>
                  <div><dt>Created</dt><dd>{formatDate(selectedPayment.createdAt)}</dd></div>
                  <div><dt>Last recorded verification</dt><dd>{formatDate(selectedPayment.verifiedAt)}</dd></div>
                  <div><dt>Verified via</dt><dd>{selectedPayment.verifiedVia || "Not verified"}</dd></div>
                  <div><dt>Processed refunds</dt><dd>{formatNaira(koboToNaira(selectedPayment.processedRefundKobo))}</dd></div>
                  <div><dt>Refunds in progress</dt><dd>{formatNaira(koboToNaira(selectedPayment.pendingRefundKobo))}</dd></div>
                  <div><dt>Currently refundable</dt><dd>{formatNaira(koboToNaira(selectedPayment.refundableKobo))}</dd></div>
                </dl>

                <div className="admin-detail-actions admin-payment-actions">
                  <ActionButton disabled={Boolean(busyAction)} onClick={() => void verifyPayment()}>{busyAction === "verify" ? "Verifying…" : "Verify with Paystack"}</ActionButton>
                  <ActionButton disabled={Boolean(busyAction)} onClick={() => { void getAdminPaymentDetail(selectedPayment.reference).then(setDetail).catch((error: unknown) => setActionError(error instanceof Error ? error.message : "Unable to refresh payment details.")); }}>Refresh details</ActionButton>
                </div>

                <section className="admin-payment-refund-history">
                  <div className="admin-payment-subheading"><h3>Refund history</h3><span>{detail.refunds.length} records</span></div>
                  {detail.refunds.length ? (
                    <div className="admin-table-wrap">
                      <table className="admin-table admin-refund-history-table">
                        <thead><tr><th>Amount</th><th>Status</th><th>Initiated by</th><th>Updated</th><th>Action</th></tr></thead>
                        <tbody>{detail.refunds.map((refund) => (
                          <tr key={refund.id}>
                            <td><strong>{formatNaira(koboToNaira(refund.amountKobo))}</strong><small>{refund.paystackRefundId ? `Paystack refund #${refund.paystackRefundId}` : "Provider ID not returned"}</small></td>
                            <td><span className={statusClass(refund.status)}>{prettyStatus(refund.status)}</span>{refund.providerMessage ? <small>{refund.providerMessage}</small> : null}</td>
                            <td><strong>{refund.createdBy}</strong><small>{refund.reason}</small></td>
                            <td>{formatDate(refund.updatedAt)}</td>
                            <td><ActionButton disabled={Boolean(busyAction) || refund.status === "failed" || refund.status === "processed"} onClick={() => void refreshRefund(refund)}>{busyAction === `refresh:${refund.id}` ? "Checking…" : refund.paystackRefundId ? "Refresh" : "Reconcile"}</ActionButton></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  ) : <div className="admin-empty-state">No refunds recorded for this payment.</div>}
                </section>

                <section className="admin-payment-refund-form-wrap">
                  <div className="admin-payment-subheading"><h3>Initiate a refund</h3><span>Through Paystack</span></div>
                  {selectedPayment.status !== "success" ? (
                    <p className="admin-payment-hint">Only transactions with a successful StatusFly payment record can be refunded. Verify the transaction first if its status is uncertain.</p>
                  ) : selectedPayment.refundableKobo <= 0 ? (
                    <p className="admin-payment-hint">No refundable balance remains. Processed, pending and uncertain refund amounts remain reserved to prevent accidental over-refunds.</p>
                  ) : (
                    <form className="admin-payment-refund-form" onSubmit={(event) => void submitRefund(event)}>
                      <label><span>Amount (₦)</span><input inputMode="decimal" type="text" value={amountNaira} onChange={(event) => setAmountNaira(event.target.value)} placeholder={`Up to ${formatNaira(koboToNaira(selectedPayment.refundableKobo))}`} required disabled={Boolean(busyAction)} /></label>
                      <label><span>Reason (required, recorded in the admin audit log)</span><textarea value={refundReason} onChange={(event) => setRefundReason(event.target.value)} rows={3} minLength={3} maxLength={1000} required disabled={Boolean(busyAction)} placeholder="Explain why this refund is being issued." /></label>
                      <p className="admin-payment-hint">Submitting sends a real refund request to Paystack. An accepted request is not the same as a completed refund. If the provider response is uncertain, the amount stays reserved until reconciled.</p>
                      <button type="submit" className="admin-page-action danger" disabled={Boolean(busyAction) || !amountNaira.trim() || refundReason.trim().length < 3}>{busyAction === "refund" ? "Submitting refund…" : "Initiate refund"}</button>
                    </form>
                  )}
                </section>
              </>
            ) : <div className="admin-empty-state">Payment details could not be loaded.</div>}
          </section>
        </div>
      ) : null}
    </section>
  );
}
