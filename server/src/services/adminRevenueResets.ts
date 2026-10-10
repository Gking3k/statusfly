import pool from "../db.js";
import { sanitizeAuditDetails } from "./adminAudit.js";

export interface AdminRevenueResetRequest {
  reason: string;
  confirmed: true;
}

export type AdminRevenueResetPayloadResult =
  | { ok: true; value: AdminRevenueResetRequest }
  | { ok: false; error: string };

export function parseAdminRevenueResetPayload(input: unknown): AdminRevenueResetPayloadResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Invalid net revenue reset request." };
  }

  const body = input as Record<string, unknown>;
  if (body.confirmed !== true) {
    return { ok: false, error: "Explicit confirmation is required to reset net revenue reporting." };
  }
  if (typeof body.reason !== "string" || body.reason.trim().length < 3 || body.reason.trim().length > 1000) {
    return { ok: false, error: "Enter a reset reason between 3 and 1,000 characters." };
  }

  return {
    ok: true,
    value: { reason: body.reason.trim(), confirmed: true },
  };
}

export async function createAdminRevenueReset(reason: string, actorUsername: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const clockResult = await client.query<{ reset_at: string }>(
      `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS reset_at`,
    );
    const resetAt = clockResult.rows[0]?.reset_at ?? new Date().toISOString();
    const actor = actorUsername.trim().slice(0, 100);
    const trimmedReason = reason.trim();

    if (!actor) {
      throw new Error("An authenticated admin username is required.");
    }

    await client.query(
      `INSERT INTO public.admin_revenue_baselines (reset_by, reason, created_at)
       VALUES ($1, $2, $3::timestamptz)`,
      [actor, trimmedReason, resetAt],
    );

    const details = sanitizeAuditDetails({
      reportingMetric: "overview_net_revenue",
      resetAt,
      historicalFinancialRecordsPreserved: true,
    });
    await client.query(
      `INSERT INTO public.admin_action_logs
        (actor_username, action, entity_type, entity_id, outcome, reason, details)
       VALUES ($1, 'admin.analytics.revenue_reset', 'revenue_reporting', 'platform', 'succeeded', $2, $3::jsonb)`,
      [actor, trimmedReason, JSON.stringify(details)],
    );

    await client.query("COMMIT");
    return {
      success: true as const,
      resetAt,
      historicalFinancialRecordsPreserved: true as const,
      financialRecordsChanged: false as const,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original error if the rollback also fails.
    }
    throw error;
  } finally {
    client.release();
  }
}
