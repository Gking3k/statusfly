const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export type ProductPageAnalyticsEventType =
  | "page_view"
  | "whatsapp_click"
  | "share_click";

const VALID_EVENT_TYPES: ProductPageAnalyticsEventType[] = [
  "page_view",
  "whatsapp_click",
  "share_click",
];

export async function recordPublicProductPageEvent(
  slug: string,
  eventType: ProductPageAnalyticsEventType,
): Promise<void> {
  if (!slug.trim()) {
    return;
  }

  if (!VALID_EVENT_TYPES.includes(eventType)) {
    return;
  }

  try {
    await fetch(
      `${API_URL}/product-pages/${encodeURIComponent(slug)}/events`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ eventType }),
        keepalive: true,
      },
    );
  } catch {
    // Analytics must never prevent the customer from using the page.
  }
}
