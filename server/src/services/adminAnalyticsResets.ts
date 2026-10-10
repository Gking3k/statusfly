import pool from "../db.js";
import { sanitizeAuditDetails } from "./adminAudit.js";

export const PLATFORM_ANALYTICS_RESET_METRICS = [
  "unique_visitors",
  "home_views",
  "create_views",
  "drafts_created",
  "payment_starts",
  "payment_init_failures",
  "public_product_page_views",
  "product_page_views",
  "whatsapp_clicks",
  "share_clicks",
] as const;

export const PRODUCT_PAGE_ANALYTICS_RESET_METRICS = [
  "product_page_views",
  "whatsapp_clicks",
  "share_clicks",
] as const;

export type AdminAnalyticsResetMetric = (typeof PLATFORM_ANALYTICS_RESET_METRICS)[number];
export type AdminAnalyticsResetScope = "platform" | "product_page";

export interface AdminAnalyticsResetRequest {
  scopeType: AdminAnalyticsResetScope;
  scopeId: string | null;
  metricKeys: AdminAnalyticsResetMetric[];
  reason: string;
}

export type AdminAnalyticsResetPayloadResult =
  | { ok: true; value: AdminAnalyticsResetRequest }
  | { ok: false; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALL_METRICS = new Set<string>(PLATFORM_ANALYTICS_RESET_METRICS);
const PAGE_METRICS = new Set<string>(PRODUCT_PAGE_ANALYTICS_RESET_METRICS);

export function parseAdminAnalyticsResetPayload(input: unknown): AdminAnalyticsResetPayloadResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Invalid analytics reset request." };
  }

  const body = input as Record<string, unknown>;
  const scopeType = body.scopeType;
  if (scopeType !== "platform" && scopeType !== "product_page") {
    return { ok: false, error: "Choose either platform or product-page scope." };
  }

  let scopeId: string | null = null;
  if (scopeType === "platform") {
    if (body.scopeId !== undefined && body.scopeId !== null && body.scopeId !== "") {
      return { ok: false, error: "Platform-wide resets must not include a product-page ID." };
    }
  } else {
    if (typeof body.scopeId !== "string" || !UUID_PATTERN.test(body.scopeId)) {
      return { ok: false, error: "A valid product-page ID is required for a page-specific reset." };
    }
    scopeId = body.scopeId;
  }

  if (!Array.isArray(body.metricKeys) || body.metricKeys.length < 1 || body.metricKeys.length > PLATFORM_ANALYTICS_RESET_METRICS.length) {
    return { ok: false, error: "Choose at least one analytics metric to reset." };
  }

  const allowedMetrics = scopeType === "platform" ? ALL_METRICS : PAGE_METRICS;
  const metricKeys: AdminAnalyticsResetMetric[] = [];
  const seen = new Set<string>();
  for (const metric of body.metricKeys) {
    if (typeof metric !== "string" || !allowedMetrics.has(metric)) {
      return {
        ok: false,
        error: scopeType === "product_page"
          ? "Product-page resets can only include views, WhatsApp clicks, and shares."
          : "One or more selected analytics metrics are not supported.",
      };
    }
    if (seen.has(metric)) {
      return { ok: false, error: "Each analytics metric may only be selected once." };
    }
    seen.add(metric);
    metricKeys.push(metric as AdminAnalyticsResetMetric);
  }

  if (typeof body.reason !== "string" || body.reason.trim().length < 3 || body.reason.trim().length > 1000) {
    return { ok: false, error: "Enter a reset reason between 3 and 1,000 characters." };
  }

  return {
    ok: true,
    value: {
      scopeType,
      scopeId,
      metricKeys,
      reason: body.reason.trim(),
    },
  };
}

export class AdminAnalyticsResetError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = "ADMIN_ANALYTICS_RESET_ERROR") {
    super(message);
    this.name = "AdminAnalyticsResetError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function createAdminAnalyticsReset(
  request: AdminAnalyticsResetRequest,
  actorUsername: string,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (request.scopeType === "product_page" && request.scopeId) {
      const pageResult = await client.query<{ id: string }>(
        "SELECT id FROM public.product_pages WHERE id = $1::uuid FOR UPDATE",
        [request.scopeId],
      );
      if (!pageResult.rows.length) {
        throw new AdminAnalyticsResetError("Product page not found. No statistics were reset.", 404, "PRODUCT_PAGE_NOT_FOUND");
      }
    }

    const clockResult = await client.query<{ reset_at: string }>(
      `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS reset_at`,
    );
    const resetAt = clockResult.rows[0]?.reset_at ?? new Date().toISOString();

    for (const metricKey of request.metricKeys) {
      await client.query(
        `INSERT INTO public.admin_analytics_baselines
          (scope_type, scope_id, metric_key, reset_by, reason, created_at)
         VALUES ($1, $2::uuid, $3, $4, $5, $6::timestamptz)`,
        [request.scopeType, request.scopeId, metricKey, actorUsername.trim().slice(0, 100), request.reason, resetAt],
      );
    }

    const details = sanitizeAuditDetails({
      scopeType: request.scopeType,
      scopeId: request.scopeId,
      metricCount: request.metricKeys.length,
      metricKeys: request.metricKeys.join(","),
    });
    await client.query(
      `INSERT INTO public.admin_action_logs
        (actor_username, action, entity_type, entity_id, outcome, reason, details)
       VALUES ($1, 'admin.analytics.reset', $2, $3, 'succeeded', $4, $5::jsonb)`,
      [
        actorUsername.trim().slice(0, 100),
        request.scopeType,
        request.scopeId ?? "platform",
        request.reason,
        JSON.stringify(details),
      ],
    );

    await client.query("COMMIT");
    return {
      success: true as const,
      scopeType: request.scopeType,
      scopeId: request.scopeId,
      metricKeys: request.metricKeys,
      resetAt,
      historicalEventsPreserved: true as const,
      financialRecordsChanged: false as const,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Keep the original failure; no success response is sent after a failed transaction.
    }
    throw error;
  } finally {
    client.release();
  }
}
