import { query } from "../db.js";

export type AdminAuditOutcome = "started" | "succeeded" | "failed";

export interface AdminAuditEventInput {
  actorUsername: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  outcome?: AdminAuditOutcome;
  reason?: string | null;
  details?: Record<string, string | number | boolean | null>;
}

export interface AdminAuditEvent {
  id: string;
  actorUsername: string;
  action: string;
  entityType: string;
  entityId: string | null;
  outcome: AdminAuditOutcome;
  reason: string | null;
  createdAt: string;
}

const SENSITIVE_DETAIL_KEY = /(password|secret|token|authorization|email|phone|whatsapp|credential|cookie|url)/i;

export function sanitizeAuditDetails(
  details: Record<string, string | number | boolean | null> | undefined,
) {
  const safe: Record<string, string | number | boolean | null> = {};

  if (!details) {
    return safe;
  }

  for (const [key, value] of Object.entries(details).slice(0, 30)) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9_]{0,59}$/.test(key) ||
      SENSITIVE_DETAIL_KEY.test(key)
    ) {
      continue;
    }

    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      safe[key] = typeof value === "string" ? value.slice(0, 500) : value;
    }
  }

  return safe;
}

export async function recordAdminAuditEvent(
  input: AdminAuditEventInput,
): Promise<void> {
  const actorUsername = input.actorUsername.trim().slice(0, 100);
  const action = input.action.trim().slice(0, 100);
  const entityType = input.entityType.trim().slice(0, 40);
  const entityId = input.entityId?.trim().slice(0, 200) || null;
  const reason = input.reason?.trim().slice(0, 1000) || null;
  const outcome = input.outcome ?? "succeeded";

  if (!actorUsername || !action || !entityType) {
    throw new Error("Actor, action, and entity type are required for admin audit records.");
  }

  await query(
    `
      INSERT INTO public.admin_action_logs (
        actor_username,
        action,
        entity_type,
        entity_id,
        outcome,
        reason,
        details
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      actorUsername,
      action,
      entityType,
      entityId,
      outcome,
      reason,
      JSON.stringify(sanitizeAuditDetails(input.details)),
    ],
  );
}

export async function getRecentAdminAuditEvents(
  requestedLimit = 20,
): Promise<AdminAuditEvent[]> {
  const limit = Math.max(1, Math.min(100, Math.trunc(requestedLimit) || 20));
  const result = await query<{
    id: string;
    actor_username: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    outcome: AdminAuditOutcome;
    reason: string | null;
    created_at: string;
  }>(
    `
      SELECT
        id,
        actor_username,
        action,
        entity_type,
        entity_id,
        outcome,
        reason,
        created_at::text
      FROM public.admin_action_logs
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    actorUsername: row.actor_username,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    outcome: row.outcome,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}
