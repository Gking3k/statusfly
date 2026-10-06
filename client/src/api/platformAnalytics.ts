const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export type PlatformAnalyticsEventType =
  | "home_view"
  | "create_view"
  | "draft_created"
  | "payment_started"
  | "payment_init_failed"
  | "public_product_page_view";

const VISITOR_ID_KEY = "statusfly:visitor-id";

function createVisitorId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16,
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getVisitorId() {
  try {
    const existing = window.localStorage.getItem(VISITOR_ID_KEY);

    if (existing) {
      return existing;
    }

    const created = createVisitorId();
    window.localStorage.setItem(VISITOR_ID_KEY, created);
    return created;
  } catch {
    return createVisitorId();
  }
}

export function trackPlatformEvent(
  eventType: PlatformAnalyticsEventType,
) {
  const visitorId = getVisitorId();

  void fetch(`${API_URL}/platform-analytics/events`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      visitorId,
      eventType,
    }),
    keepalive: true,
  }).catch(() => {
    // Analytics must never interrupt the user experience.
  });
}
