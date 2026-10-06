import { query } from "../db.js";

export type PlatformAnalyticsEventType =
  | "home_view"
  | "create_view"
  | "draft_created"
  | "payment_started"
  | "payment_init_failed"
  | "public_product_page_view";

const VALID_EVENT_TYPES: PlatformAnalyticsEventType[] = [
  "home_view",
  "create_view",
  "draft_created",
  "payment_started",
  "payment_init_failed",
  "public_product_page_view",
];

export function isValidPlatformAnalyticsEventType(
  value: unknown,
): value is PlatformAnalyticsEventType {
  return (
    typeof value === "string" &&
    VALID_EVENT_TYPES.includes(
      value as PlatformAnalyticsEventType,
    )
  );
}

export function isValidVisitorId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export async function recordPlatformAnalyticsEvent(
  visitorId: string,
  eventType: PlatformAnalyticsEventType,
): Promise<void> {
  if (!isValidVisitorId(visitorId)) {
    throw new Error("A valid visitor ID is required.");
  }

  if (!isValidPlatformAnalyticsEventType(eventType)) {
    throw new Error("Invalid platform analytics event.");
  }

  await query(
    `
      INSERT INTO platform_analytics_events (
        visitor_id,
        event_type
      )
      VALUES ($1, $2)
    `,
    [visitorId, eventType],
  );
}
