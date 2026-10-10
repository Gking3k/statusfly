import type { PoolClient } from "pg";
import pool, { query } from "../db.js";

export type AdminPaymentStatus = "pending" | "success" | "failed" | "invalid";
export type AdminPaymentStatusFilter = "all" | AdminPaymentStatus;
export type AdminRefundStatus =
  | "initiating"
  | "pending"
  | "processing"
  | "needs-attention"
  | "processed"
  | "failed"
  | "initiation_unknown";

export class AdminPaymentError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = "ADMIN_PAYMENT_ERROR") {
    super(message);
    this.name = "AdminPaymentError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface AdminPaymentRow {
  id: string;
  productPageId: string;
  reference: string;
  amountKobo: number;
  currency: string;
  status: AdminPaymentStatus;
  customerEmail: string | null;
  productName: string;
  brandName: string;
  publicSlug: string;
  createdAt: string;
  verifiedAt: string | null;
  verifiedVia: string | null;
  processedRefundKobo: number;
  pendingRefundKobo: number;
  refundableKobo: number;
  refundCount: number;
  latestRefundStatus: AdminRefundStatus | null;
}

export interface AdminRefundRow {
  id: string;
  paymentReference: string;
  paystackRefundId: number | null;
  amountKobo: number;
  currency: string;
  status: AdminRefundStatus;
  reason: string;
  createdBy: string;
  lastProviderEvent: string | null;
  providerMessage: string | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
}

function numeric(value: number | string | null | undefined): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function mapPaymentRow(row: Record<string, unknown>): AdminPaymentRow {
  const amountKobo = numeric(row.amount_kobo as number | string | null);
  const reservedRefundKobo = numeric(row.reserved_refund_kobo as number | string | null);
  return {
    id: String(row.id),
    productPageId: String(row.product_page_id),
    reference: String(row.reference),
    amountKobo,
    currency: String(row.currency),
    status: row.status as AdminPaymentStatus,
    customerEmail: typeof row.customer_email === "string" ? row.customer_email : null,
    productName: String(row.product_name),
    brandName: String(row.brand_name),
    publicSlug: String(row.public_slug),
    createdAt: String(row.created_at),
    verifiedAt: typeof row.verified_at === "string" ? row.verified_at : null,
    verifiedVia: typeof row.verified_via === "string" ? row.verified_via : null,
    processedRefundKobo: numeric(row.processed_refund_kobo as number | string | null),
    pendingRefundKobo: numeric(row.pending_refund_kobo as number | string | null),
    refundableKobo: Math.max(0, amountKobo - reservedRefundKobo),
    refundCount: numeric(row.refund_count as number | string | null),
    latestRefundStatus: (typeof row.latest_refund_status === "string"
      ? row.latest_refund_status
      : null) as AdminRefundStatus | null,
  };
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

const PAYMENT_SELECT = `
  SELECT
    payment.id,
    payment.product_page_id,
    payment.reference,
    payment.amount_kobo,
    payment.currency,
    payment.status,
    payment.customer_email,
    payment.created_at::text AS created_at,
    payment.verified_at::text AS verified_at,
    payment.verified_via,
    page.product_name,
    page.brand_name,
    page.public_slug,
    COALESCE(refunds.processed_refund_kobo, 0)::text AS processed_refund_kobo,
    COALESCE(refunds.pending_refund_kobo, 0)::text AS pending_refund_kobo,
    COALESCE(refunds.reserved_refund_kobo, 0)::text AS reserved_refund_kobo,
    COALESCE(refunds.refund_count, 0)::int AS refund_count,
    refunds.latest_refund_status
  FROM public.product_page_payments payment
  JOIN public.product_pages page ON page.id = payment.product_page_id
  LEFT JOIN LATERAL (
    SELECT
      SUM(refund.amount_kobo) FILTER (WHERE refund.status = 'processed') AS processed_refund_kobo,
      SUM(refund.amount_kobo) FILTER (
        WHERE refund.status IN ('initiating', 'pending', 'processing', 'needs-attention', 'initiation_unknown')
      ) AS pending_refund_kobo,
      SUM(refund.amount_kobo) FILTER (
        WHERE refund.status IN ('initiating', 'pending', 'processing', 'needs-attention', 'processed', 'initiation_unknown')
      ) AS reserved_refund_kobo,
      COUNT(*)::int AS refund_count,
      (ARRAY_AGG(refund.status ORDER BY refund.created_at DESC))[1] AS latest_refund_status
    FROM public.admin_payment_refunds refund
    WHERE refund.payment_id = payment.id
  ) refunds ON TRUE
`;

export async function listAdminPayments(options: {
  search: string;
  status: AdminPaymentStatusFilter;
  page: number;
  pageSize: number;
}) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const add = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const search = options.search.trim().slice(0, 100);
  if (search) {
    const term = add(`%${escapeLike(search)}%`);
    clauses.push(`(
      payment.reference ILIKE ${term} ESCAPE E'\\\\'
      OR COALESCE(payment.customer_email, '') ILIKE ${term} ESCAPE E'\\\\'
      OR page.product_name ILIKE ${term} ESCAPE E'\\\\'
      OR page.brand_name ILIKE ${term} ESCAPE E'\\\\'
      OR page.public_slug ILIKE ${term} ESCAPE E'\\\\'
    )`);
  }
  if (options.status !== "all") {
    clauses.push(`payment.status = ${add(options.status)}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const countResult = await query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM public.product_page_payments payment
      JOIN public.product_pages page ON page.id = payment.product_page_id ${where}`,
    values,
  );
  const total = numeric(countResult.rows[0]?.total);
  const listValues = [...values, options.pageSize, (options.page - 1) * options.pageSize];
  const listed = await query<Record<string, unknown>>(
    `${PAYMENT_SELECT} ${where}
      ORDER BY payment.created_at DESC, payment.id DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    listValues,
  );

  const summaryResult = await query<{
    payment_count: string;
    successful_payments: string;
    gross_revenue_kobo: string;
    processed_refund_kobo: string;
    pending_refund_kobo: string;
  }>(`
    SELECT
      COUNT(*)::text AS payment_count,
      COUNT(*) FILTER (WHERE payment.status = 'success')::text AS successful_payments,
      COALESCE(SUM(payment.amount_kobo) FILTER (WHERE payment.status = 'success'), 0)::text AS gross_revenue_kobo,
      COALESCE(SUM(COALESCE(refunds.processed_refund_kobo, 0)) FILTER (WHERE payment.status = 'success'), 0)::text AS processed_refund_kobo,
      COALESCE(SUM(COALESCE(refunds.pending_refund_kobo, 0)) FILTER (WHERE payment.status = 'success'), 0)::text AS pending_refund_kobo
    FROM public.product_page_payments payment
    LEFT JOIN LATERAL (
      SELECT
        SUM(refund.amount_kobo) FILTER (WHERE refund.status = 'processed') AS processed_refund_kobo,
        SUM(refund.amount_kobo) FILTER (WHERE refund.status IN ('initiating', 'pending', 'processing', 'needs-attention', 'initiation_unknown')) AS pending_refund_kobo
      FROM public.admin_payment_refunds refund
      WHERE refund.payment_id = payment.id
    ) refunds ON TRUE
  `);
  const summary = summaryResult.rows[0];
  const grossRevenueKobo = numeric(summary?.gross_revenue_kobo);
  const processedRefundKobo = numeric(summary?.processed_refund_kobo);

  return {
    payments: listed.rows.map(mapPaymentRow),
    pagination: {
      page: options.page,
      pageSize: options.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / options.pageSize)),
    },
    summary: {
      paymentCount: numeric(summary?.payment_count),
      successfulPayments: numeric(summary?.successful_payments),
      grossRevenueKobo,
      processedRefundKobo,
      netRevenueKobo: grossRevenueKobo - processedRefundKobo,
      pendingRefundKobo: numeric(summary?.pending_refund_kobo),
    },
  };
}

async function getAdminPaymentRow(reference: string, client?: PoolClient) {
  const sql = `${PAYMENT_SELECT} WHERE payment.reference = $1 LIMIT 1`;
  const result = client
    ? await client.query<Record<string, unknown>>(sql, [reference])
    : await query<Record<string, unknown>>(sql, [reference]);
  return result.rows[0] ? mapPaymentRow(result.rows[0]) : null;
}

function mapRefundRow(row: Record<string, unknown>): AdminRefundRow {
  const idValue = row.paystack_refund_id;
  const refundId = idValue === null || idValue === undefined ? null : numeric(idValue as number | string);
  return {
    id: String(row.id),
    paymentReference: String(row.payment_reference),
    paystackRefundId: refundId,
    amountKobo: numeric(row.amount_kobo as number | string),
    currency: String(row.currency),
    status: row.status as AdminRefundStatus,
    reason: String(row.reason),
    createdBy: String(row.created_by),
    lastProviderEvent: typeof row.last_provider_event === "string" ? row.last_provider_event : null,
    providerMessage: typeof row.provider_message === "string" ? row.provider_message : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    processedAt: typeof row.processed_at === "string" ? row.processed_at : null,
  };
}

const REFUND_SELECT = `
  SELECT id, payment_reference, paystack_refund_id, amount_kobo, currency, status,
    reason, created_by, last_provider_event, provider_message,
    created_at::text AS created_at, updated_at::text AS updated_at, processed_at::text AS processed_at
  FROM public.admin_payment_refunds
`;

export async function getAdminPaymentDetail(reference: string) {
  const payment = await getAdminPaymentRow(reference);
  if (!payment) return null;
  const refundsResult = await query<Record<string, unknown>>(
    `${REFUND_SELECT} WHERE payment_reference = $1 ORDER BY created_at DESC, id DESC`,
    [reference],
  );
  return { payment, refunds: refundsResult.rows.map(mapRefundRow) };
}

export async function getAdminRefundById(id: string) {
  const result = await query<Record<string, unknown>>(
    `${REFUND_SELECT} WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ? mapRefundRow(result.rows[0]) : null;
}

export function parsePaystackRefundStatus(value: unknown): AdminRefundStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "pending" ||
    normalized === "processing" ||
    normalized === "needs-attention" ||
    normalized === "processed" ||
    normalized === "failed"
  ) return normalized;
  return null;
}

function parseRefundId(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function updateRefundState(refundId: string, update: {
  status: AdminRefundStatus;
  paystackRefundId?: number | null;
  providerEvent?: string | null;
  providerMessage?: string | null;
}) {
  const result = await query<Record<string, unknown>>(
    `UPDATE public.admin_payment_refunds
      SET status = CASE
            WHEN status = 'processed' THEN 'processed'
            WHEN $2 = 'processed' THEN 'processed'
            WHEN status = 'failed' AND $2 <> 'processed' THEN 'failed'
            WHEN $2 = 'failed' THEN 'failed'
            WHEN status IN ('processing', 'needs-attention') AND $2 = 'pending' THEN status
            ELSE $2
          END,
          paystack_refund_id = COALESCE($3, paystack_refund_id),
          last_provider_event = COALESCE($4, last_provider_event),
          provider_message = $5,
          updated_at = NOW(),
          processed_at = CASE WHEN $2 = 'processed' THEN COALESCE(processed_at, NOW()) ELSE processed_at END
      WHERE id = $1
      RETURNING id, payment_reference, paystack_refund_id, amount_kobo, currency, status,
        reason, created_by, last_provider_event, provider_message,
        created_at::text AS created_at, updated_at::text AS updated_at, processed_at::text AS processed_at`,
    [refundId, update.status, update.paystackRefundId ?? null, update.providerEvent ?? null, update.providerMessage ?? null],
  );
  if (!result.rows[0]) throw new AdminPaymentError("Refund record not found.", 404, "REFUND_NOT_FOUND");
  return mapRefundRow(result.rows[0]);
}

async function reserveRefund(input: {
  reference: string;
  amountKobo: number;
  reason: string;
  createdBy: string;
  requestId: string;
}): Promise<{ refund: AdminRefundRow; alreadyExists: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const byKey = await client.query<Record<string, unknown>>(
      `${REFUND_SELECT} WHERE idempotency_key = $1 LIMIT 1`,
      [input.requestId],
    );
    if (byKey.rows[0]) {
      const existing = mapRefundRow(byKey.rows[0]);
      if (existing.paymentReference !== input.reference || existing.amountKobo !== input.amountKobo) {
        throw new AdminPaymentError("This refund request ID was already used for a different refund.", 409, "REFUND_IDEMPOTENCY_CONFLICT");
      }
      await client.query("COMMIT");
      return { refund: existing, alreadyExists: true };
    }

    const paymentResult = await client.query<{
      id: string;
      reference: string;
      amount_kobo: number | string;
      currency: string;
      status: AdminPaymentStatus;
    }>(
      `SELECT id, reference, amount_kobo, currency, status
       FROM public.product_page_payments WHERE reference = $1 FOR UPDATE`,
      [input.reference],
    );
    const payment = paymentResult.rows[0];
    if (!payment) throw new AdminPaymentError("Payment reference not found.", 404, "PAYMENT_NOT_FOUND");
    if (payment.status !== "success") {
      throw new AdminPaymentError("Only payments verified as successful can be refunded.", 409, "PAYMENT_NOT_SUCCESSFUL");
    }
    if (payment.currency !== "NGN") {
      throw new AdminPaymentError("Only NGN transactions can be refunded from this dashboard.", 409, "UNSUPPORTED_CURRENCY");
    }
    if (!Number.isSafeInteger(input.amountKobo) || input.amountKobo <= 0) {
      throw new AdminPaymentError("Enter a valid refund amount greater than ₦0.", 400, "INVALID_REFUND_AMOUNT");
    }

    const reservedResult = await client.query<{ reserved: string }>(
      `SELECT COALESCE(SUM(amount_kobo), 0)::text AS reserved
       FROM public.admin_payment_refunds
       WHERE payment_id = $1 AND status IN ('initiating', 'pending', 'processing', 'needs-attention', 'processed', 'initiation_unknown')`,
      [payment.id],
    );
    const amountKobo = numeric(payment.amount_kobo);
    const reserved = numeric(reservedResult.rows[0]?.reserved);
    const remaining = amountKobo - reserved;
    if (input.amountKobo > remaining) {
      throw new AdminPaymentError(
        `The remaining refundable balance is ₦${Math.max(0, remaining / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. A pending or uncertain refund also reserves funds until reconciled.`,
        409,
        "REFUND_EXCEEDS_REMAINING_BALANCE",
      );
    }

    const insert = await client.query<Record<string, unknown>>(
      `INSERT INTO public.admin_payment_refunds (
         payment_id, payment_reference, idempotency_key, amount_kobo, currency,
         status, reason, created_by
       ) VALUES ($1, $2, $3, $4, $5, 'initiating', $6, $7)
       RETURNING id, payment_reference, paystack_refund_id, amount_kobo, currency, status,
         reason, created_by, last_provider_event, provider_message,
         created_at::text AS created_at, updated_at::text AS updated_at, processed_at::text AS processed_at`,
      [payment.id, payment.reference, input.requestId, input.amountKobo, payment.currency, input.reason, input.createdBy],
    );
    await client.query("COMMIT");
    return { refund: mapRefundRow(insert.rows[0]!), alreadyExists: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (
      error && typeof error === "object" &&
      "code" in error && (error as { code?: string }).code === "23505"
    ) {
      throw new AdminPaymentError("This refund request was already submitted. Refresh the payment and check its refund history.", 409, "REFUND_DUPLICATE_REQUEST");
    }
    throw error;
  } finally {
    client.release();
  }
}

class PaystackRefundRequestError extends Error {
  explicitRejection: boolean;
  statusCode: number;
  constructor(message: string, explicitRejection: boolean, statusCode = 502) {
    super(message);
    this.name = "PaystackRefundRequestError";
    this.explicitRejection = explicitRejection;
    this.statusCode = statusCode;
  }
}

async function paystackJson(path: string, init: RequestInit = {}) {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) throw new AdminPaymentError("PAYSTACK_SECRET_KEY is not configured on the server.", 503, "PAYSTACK_NOT_CONFIGURED");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    let response: Response;
    try {
      response = await fetch(`https://api.paystack.co${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new PaystackRefundRequestError(
        "Paystack did not return a clear response. The refund is marked as uncertain and its amount is reserved to prevent duplicate refunds. Check Paystack before retrying.",
        false,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new PaystackRefundRequestError(
        "Paystack returned an unreadable response. The refund is marked as uncertain; check Paystack before retrying.",
        false,
      );
    }
    const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    if (!response.ok || data.status !== true) {
      const message = typeof data.message === "string" ? data.message.slice(0, 400) : "Paystack did not confirm the request.";
      // Clear 4xx rejections and a structured 2xx status:false response are
      // explicit provider rejections. A 5xx can happen after the provider has
      // accepted the request, so it must remain uncertain and must reserve funds.
      const explicitRejection =
        (response.status >= 400 && response.status < 500) ||
        (response.ok && data.status === false);
      throw new PaystackRefundRequestError(
        message,
        explicitRejection,
        explicitRejection ? 422 : 502,
      );
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function initiateAdminPaymentRefund(input: {
  reference: string;
  amountKobo: number;
  reason: string;
  createdBy: string;
  requestId: string;
}) {
  if (!process.env.PAYSTACK_SECRET_KEY?.trim()) {
    throw new AdminPaymentError("Paystack refunds are unavailable because PAYSTACK_SECRET_KEY is not configured.", 503, "PAYSTACK_NOT_CONFIGURED");
  }
  const reserved = await reserveRefund(input);
  if (reserved.alreadyExists) {
    // A retry with the same idempotency key must never create a second external refund.
    return { refund: reserved.refund, replayed: true };
  }

  try {
    const payload = await paystackJson("/refund", {
      method: "POST",
      body: JSON.stringify({
        transaction: input.reference,
        amount: input.amountKobo,
        currency: "NGN",
        customer_note: "A refund has been initiated for your StatusFly product-page payment.",
        merchant_note: `StatusFly refund ${reserved.refund.id}. Reason: ${input.reason.slice(0, 180)}`,
      }),
    });
    const providerData = payload.data && typeof payload.data === "object"
      ? payload.data as Record<string, unknown>
      : {};
    const providerRefundId = parseRefundId(providerData.id);
    const providerStatus = parsePaystackRefundStatus(providerData.status);
    if (!providerRefundId || !providerStatus) {
      const refund = await updateRefundState(reserved.refund.id, {
        status: "initiation_unknown",
        paystackRefundId: providerRefundId,
        providerEvent: "refund.response_unreconciled",
        providerMessage: "Paystack accepted the request but did not return a usable refund ID and known status. Check the Paystack dashboard before taking further action.",
      });
      return { refund, replayed: false };
    }
    const refund = await updateRefundState(reserved.refund.id, {
      status: providerStatus,
      paystackRefundId: providerRefundId,
      providerEvent: `refund.${providerStatus}`,
      providerMessage: typeof payload.message === "string" ? payload.message.slice(0, 500) : null,
    });
    return { refund, replayed: false };
  } catch (error) {
    if (error instanceof PaystackRefundRequestError && error.explicitRejection) {
      await updateRefundState(reserved.refund.id, {
        status: "failed",
        providerEvent: "refund.request_rejected",
        providerMessage: error.message.slice(0, 500),
      });
      throw new AdminPaymentError(`Paystack rejected the refund request: ${error.message}`, error.statusCode, "PAYSTACK_REFUND_REJECTED");
    }

    await updateRefundState(reserved.refund.id, {
      status: "initiation_unknown",
      providerEvent: "refund.initiation_unknown",
      providerMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown Paystack request result.",
    }).catch((updateError) => {
      console.error("Unable to persist ambiguous Paystack refund status:", updateError);
    });
    if (error instanceof AdminPaymentError) throw error;
    throw new AdminPaymentError(
      error instanceof Error ? error.message : "Unable to confirm refund initiation with Paystack.",
      502,
      "PAYSTACK_REFUND_OUTCOME_UNKNOWN",
    );
  }
}

async function reconcileRefundWithoutProviderId(existing: AdminRefundRow) {
  const payment = await getAdminPaymentRow(existing.paymentReference);
  if (!payment) throw new AdminPaymentError("The original payment record could not be found.", 404, "PAYMENT_NOT_FOUND");

  // Paystack's List Refunds API filters by the numeric transaction ID, so first
  // verify the stored reference and derive that ID from Paystack itself.
  const transactionPayload = await paystackJson(
    `/transaction/verify/${encodeURIComponent(payment.reference)}`,
    { method: "GET" },
  );
  const transactionData = transactionPayload.data && typeof transactionPayload.data === "object"
    ? transactionPayload.data as Record<string, unknown>
    : {};
  const transactionId = parseRefundId(transactionData.id);
  const transactionAmount = typeof transactionData.amount === "number"
    ? transactionData.amount
    : Number(transactionData.amount);
  const transactionCurrency = typeof transactionData.currency === "string"
    ? transactionData.currency.toUpperCase()
    : "";
  if (
    !transactionId ||
    transactionData.reference !== payment.reference ||
    !Number.isSafeInteger(transactionAmount) ||
    transactionAmount !== payment.amountKobo ||
    transactionCurrency !== payment.currency.toUpperCase()
  ) {
    throw new AdminPaymentError(
      "Paystack's transaction details did not match this StatusFly payment. The uncertain refund was not changed.",
      409,
      "REFUND_RECONCILIATION_PAYMENT_MISMATCH",
    );
  }

  const refundsPayload = await paystackJson(
    `/refund?transaction=${encodeURIComponent(String(transactionId))}&perPage=50&page=1`,
    { method: "GET" },
  );
  const refundItems = Array.isArray(refundsPayload.data) ? refundsPayload.data : [];
  const marker = `StatusFly refund ${existing.id}`;
  const candidates = refundItems.filter((item): item is Record<string, unknown> => {
    if (!item || typeof item !== "object") return false;
    const refund = item as Record<string, unknown>;
    const refundId = parseRefundId(refund.id);
    const amount = typeof refund.amount === "number" ? refund.amount : Number(refund.amount);
    const merchantNote = typeof refund.merchant_note === "string" ? refund.merchant_note : "";
    const status = parsePaystackRefundStatus(refund.status);
    const refundTransaction = refund.transaction && typeof refund.transaction === "object"
      ? refund.transaction as Record<string, unknown>
      : null;
    const refundTransactionId = refundTransaction
      ? parseRefundId(refundTransaction.id)
      : parseRefundId(refund.transaction);
    return Boolean(
      refundId && status &&
      Number.isSafeInteger(amount) && amount === existing.amountKobo &&
      merchantNote.includes(marker) &&
      (!refundTransactionId || refundTransactionId === transactionId)
    );
  });

  if (candidates.length !== 1) {
    throw new AdminPaymentError(
      candidates.length === 0
        ? "No Paystack refund could be uniquely matched to this StatusFly request. The record remains reserved; inspect the Paystack dashboard before any further action."
        : "More than one Paystack refund matched this request. No changes were made; inspect Paystack before proceeding.",
      409,
      candidates.length === 0 ? "REFUND_RECONCILIATION_NOT_FOUND" : "REFUND_RECONCILIATION_AMBIGUOUS",
    );
  }

  const providerRefund = candidates[0]!;
  const providerRefundId = parseRefundId(providerRefund.id);
  const providerStatus = parsePaystackRefundStatus(providerRefund.status);
  if (!providerRefundId || !providerStatus) {
    throw new AdminPaymentError("Paystack returned an incomplete refund record; the saved status was not changed.", 502, "REFUND_RECONCILIATION_INCOMPLETE");
  }
  return updateRefundState(existing.id, {
    status: providerStatus,
    paystackRefundId: providerRefundId,
    providerEvent: "refund.reconciled",
    providerMessage: "Matched the unique StatusFly refund marker in Paystack's refund list.",
  });
}

export async function refreshAdminRefundFromPaystack(id: string) {
  const existing = await getAdminRefundById(id);
  if (!existing) throw new AdminPaymentError("Refund record not found.", 404, "REFUND_NOT_FOUND");
  if (!existing.paystackRefundId) {
    return reconcileRefundWithoutProviderId(existing);
  }
  const payload = await paystackJson(`/refund/${encodeURIComponent(String(existing.paystackRefundId))}`, { method: "GET" });
  const providerData = payload.data && typeof payload.data === "object"
    ? payload.data as Record<string, unknown>
    : {};
  const returnedRefundId = parseRefundId(providerData.id);
  const providerStatus = parsePaystackRefundStatus(providerData.status);
  if (returnedRefundId !== existing.paystackRefundId || !providerStatus) {
    throw new AdminPaymentError("Paystack returned an unrecognized or mismatched refund record; the saved status was not changed.", 502, "UNKNOWN_PAYSTACK_REFUND_STATUS");
  }
  return updateRefundState(id, {
    status: providerStatus,
    paystackRefundId: returnedRefundId,
    providerEvent: `refund.${providerStatus}`,
    providerMessage: typeof payload.message === "string" ? payload.message.slice(0, 500) : null,
  });
}

export async function recordAdminRefundWebhook(input: {
  event: string;
  transactionReference: string;
  refundId: number | null;
  amountKobo: number | null;
  providerMessage?: string | null;
}) {
  const eventStatus = parsePaystackRefundStatus(input.event.replace(/^refund\./, ""));
  if (!eventStatus || !input.transactionReference) return false;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const paymentResult = await client.query<{ id: string; reference: string }>(
      `SELECT id, reference FROM public.product_page_payments WHERE reference = $1 LIMIT 1`,
      [input.transactionReference],
    );
    const payment = paymentResult.rows[0];
    if (!payment) {
      await client.query("COMMIT");
      return false;
    }

    let matchedRefundId: string | undefined;
    if (input.refundId !== null) {
      const byProviderId = await client.query<{ id: string }>(
        `SELECT id FROM public.admin_payment_refunds
         WHERE payment_id = $1 AND paystack_refund_id = $2
         LIMIT 1 FOR UPDATE`,
        [payment.id, input.refundId],
      );
      matchedRefundId = byProviderId.rows[0]?.id;
    }

    // Paystack's refund webhook payload can omit a refund ID. In that case,
    // match by amount only when exactly one local record can possibly match.
    // Never guess between two same-amount refunds on the same transaction.
    if (!matchedRefundId && input.amountKobo !== null && input.amountKobo > 0 && input.refundId === null) {
      const byAmount = await client.query<{ id: string }>(
        `SELECT id FROM public.admin_payment_refunds
         WHERE payment_id = $1 AND amount_kobo = $2
           AND created_at >= NOW() - INTERVAL '30 days'
         ORDER BY created_at DESC
         FOR UPDATE`,
        [payment.id, input.amountKobo],
      );
      if (byAmount.rows.length === 1) {
        matchedRefundId = byAmount.rows[0]?.id;
      } else if (byAmount.rows.length > 1) {
        console.warn("Paystack refund webhook could not be matched unambiguously.", {
          paymentReference: input.transactionReference,
          amountKobo: input.amountKobo,
        });
        await client.query("COMMIT");
        return false;
      }
    }

    // When the provider supplies an ID, preserve refunds initiated directly in
    // Paystack by creating an auditable local row if it is not already known.
    // Without an ID and without one unambiguous local match, do not fabricate a
    // record: a later webhook could otherwise be mistaken for this refund.
    if (!matchedRefundId && input.refundId !== null && input.amountKobo && input.amountKobo > 0) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.admin_payment_refunds (
           payment_id, payment_reference, amount_kobo, currency, status, reason, created_by,
           paystack_refund_id, last_provider_event, provider_message
         ) VALUES ($1, $2, $3, 'NGN', $4, $5, 'paystack_webhook', $6, $7, $8)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [payment.id, payment.reference, input.amountKobo, eventStatus,
          "Refund created or updated externally in Paystack.", input.refundId,
          input.event.slice(0, 40), input.providerMessage?.slice(0, 500) ?? null],
      );
      matchedRefundId = created.rows[0]?.id;
      if (!matchedRefundId) {
        // A duplicate provider-ID event is already represented; commit the no-op.
        await client.query("COMMIT");
        return false;
      }
    }

    if (matchedRefundId) {
      // Terminal statuses do not regress when provider events arrive out of order.
      await client.query(
        `UPDATE public.admin_payment_refunds
         SET status = CASE
               WHEN status IN ('processed', 'failed') THEN status
               WHEN $2 = 'processed' THEN 'processed'
               WHEN $2 = 'failed' THEN 'failed'
               ELSE $2
             END,
             paystack_refund_id = COALESCE($3, paystack_refund_id),
             last_provider_event = $4,
             provider_message = $5,
             updated_at = NOW(),
             processed_at = CASE
               WHEN $2 = 'processed' THEN COALESCE(processed_at, NOW())
               ELSE processed_at
             END
         WHERE id = $1`,
        [matchedRefundId, eventStatus, input.refundId, input.event.slice(0, 40), input.providerMessage?.slice(0, 500) ?? null],
      );
    }

    await client.query("COMMIT");
    return Boolean(matchedRefundId);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function parsePaystackMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      // Invalid metadata must fail the transaction match.
    }
  }
  return {};
}

export async function verifyAdminPaymentWithPaystack(reference: string) {
  const payment = await getAdminPaymentRow(reference);
  if (!payment) throw new AdminPaymentError("Payment reference not found.", 404, "PAYMENT_NOT_FOUND");

  const payload = await paystackJson(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" });
  const data = payload.data && typeof payload.data === "object"
    ? payload.data as Record<string, unknown>
    : {};
  const providerReference = typeof data.reference === "string" ? data.reference : "";
  const providerStatus = typeof data.status === "string" ? data.status.toLowerCase() : "unknown";
  const amount = typeof data.amount === "number" ? data.amount : Number(data.amount);
  const currency = typeof data.currency === "string" ? data.currency.toUpperCase() : "";
  const metadata = parsePaystackMetadata(data.metadata);
  const metadataPageId = typeof metadata.productPageId === "string" ? metadata.productPageId : "";
  const metadataType = typeof metadata.type === "string" ? metadata.type : "";

  const matched =
    providerReference === payment.reference &&
    Number.isSafeInteger(amount) && amount === payment.amountKobo &&
    currency === payment.currency.trim().toUpperCase() &&
    metadataType === "statusfly_product_page" &&
    metadataPageId === payment.productPageId;

  if (!matched) {
    return {
      matched: false,
      outcome: "mismatch" as const,
      providerStatus,
      message: "Paystack's transaction details do not match this StatusFly payment record. No payment record was changed; review the reference in Paystack before taking action.",
      payment: await getAdminPaymentRow(reference),
    };
  }

  if (providerStatus === "success") {
    if (payment.status === "invalid") {
      return {
        matched: true,
        outcome: "manual_review" as const,
        providerStatus,
        message: "Paystack reports success, but StatusFly has this payment flagged as invalid. The record was not automatically changed; review it before correcting its status.",
        payment,
      };
    }

    if (payment.status === "success") {
      return {
        matched: true,
        outcome: "already_successful" as const,
        providerStatus,
        message: "Paystack confirms this transaction succeeded. The existing payment record was preserved.",
        payment,
      };
    }

    const { fulfillSuccessfulProductPagePayment } = await import("./productPagePaymentFlow.js");
    const fulfilled = await fulfillSuccessfulProductPagePayment(reference, "admin", payment.amountKobo);
    if (!fulfilled) {
      throw new AdminPaymentError(
        "Paystack confirms payment, but StatusFly could not reconcile it. The transaction may be paid while the product page remains unpublished; inspect the page before retrying.",
        409,
        "PAYMENT_FULFILLMENT_INCOMPLETE",
      );
    }
    return {
      matched: true,
      outcome: "verified_success" as const,
      providerStatus,
      message: "Paystack confirms payment. StatusFly has reconciled the payment record; existing hidden or archived page states were preserved.",
      payment: await getAdminPaymentRow(reference),
    };
  }

  if (providerStatus === "failed" && payment.status === "pending") {
    await query(
      `UPDATE public.product_page_payments SET status = 'failed' WHERE reference = $1 AND status = 'pending'`,
      [reference],
    );
    return {
      matched: true,
      outcome: "verified_failed" as const,
      providerStatus,
      message: "Paystack confirms this transaction failed. The pending StatusFly record was marked failed.",
      payment: await getAdminPaymentRow(reference),
    };
  }

  return {
    matched: true,
    outcome: "no_change" as const,
    providerStatus,
    message: `Paystack reports the transaction status as "${providerStatus}". No payment record was changed.`,
    payment: await getAdminPaymentRow(reference),
  };
}
