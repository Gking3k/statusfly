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
      FROM public.product_page_analytics_events
      WHERE product_page_id = $1::uuid
        AND created_at >= GREATEST(
          COALESCE((
            SELECT MAX(b.created_at)
            FROM public.admin_analytics_baselines b
            WHERE b.scope_type = 'platform'
              AND b.scope_id IS NULL
              AND b.metric_key = CASE product_page_analytics_events.event_type
                WHEN 'page_view' THEN 'product_page_views'
                WHEN 'whatsapp_click' THEN 'whatsapp_clicks'
                WHEN 'share_click' THEN 'share_clicks'
              END
          ), '-infinity'::timestamptz),
          COALESCE((
            SELECT MAX(b.created_at)
            FROM public.admin_analytics_baselines b
            WHERE b.scope_type = 'product_page'
              AND b.scope_id = $1::uuid
              AND b.metric_key = CASE product_page_analytics_events.event_type
                WHEN 'page_view' THEN 'product_page_views'
                WHEN 'whatsapp_click' THEN 'whatsapp_clicks'
                WHEN 'share_click' THEN 'share_clicks'
              END
          ), '-infinity'::timestamptz)
        )
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
