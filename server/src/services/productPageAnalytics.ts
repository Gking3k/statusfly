import { query } from "../db.js";

export type ProductPageAnalyticsEventType =
  | "page_view"
  | "whatsapp_click"
  | "share_click";

const VALID_EVENT_TYPES: ProductPageAnalyticsEventType[] = [
  "page_view",
  "whatsapp_click",
  "share_click",
];

export interface ProductPageAnalytics {
  pageViews: number;
  whatsappClicks: number;
  shareClicks: number;
}

export async function recordProductPageEvent(
  productPageId: string,
  eventType: ProductPageAnalyticsEventType,
): Promise<void> {
  if (!productPageId) {
    throw new Error("Product page ID is required.");
  }

  if (!VALID_EVENT_TYPES.includes(eventType)) {
    throw new Error("Invalid product page analytics event.");
  }

  await query(
    `
      INSERT INTO product_page_analytics_events (
        product_page_id,
        event_type
      )
      VALUES ($1, $2)
    `,
    [productPageId, eventType],
  );
}

export async function getProductPageAnalytics(
  productPageId: string,
): Promise<ProductPageAnalytics> {
  if (!productPageId) {
    throw new Error("Product page ID is required.");
  }

  const result = await query<{
    event_type: ProductPageAnalyticsEventType;
    total: string;
  }>(
    `
      SELECT
        event_type,
        COUNT(*)::text AS total
      FROM product_page_analytics_events
      WHERE product_page_id = $1
      GROUP BY event_type
    `,
    [productPageId],
  );

  const analytics: ProductPageAnalytics = {
    pageViews: 0,
    whatsappClicks: 0,
    shareClicks: 0,
  };

  for (const row of result.rows) {
    const total = Number(row.total);

    if (row.event_type === "page_view") {
      analytics.pageViews = total;
    } else if (row.event_type === "whatsapp_click") {
      analytics.whatsappClicks = total;
    } else if (row.event_type === "share_click") {
      analytics.shareClicks = total;
    }
  }

  return analytics;
}
