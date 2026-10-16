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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProductPageItemWhatsappClicks {
  productPageItemId: string;
  productName: string;
  clicks: number;
}

export interface ProductPageAnalytics {
  pageViews: number;
  whatsappClicks: number;
  shareClicks: number;
  itemWhatsappClicks: ProductPageItemWhatsappClicks[];
}

export async function recordProductPageEvent(
  productPageId: string,
  eventType: ProductPageAnalyticsEventType,
  productPageItemId?: string,
): Promise<void> {
  if (!productPageId) {
    throw new Error("Product page ID is required.");
  }

  if (!VALID_EVENT_TYPES.includes(eventType)) {
    throw new Error("Invalid product page analytics event.");
  }

  if (productPageItemId !== undefined) {
    if (!UUID_PATTERN.test(productPageItemId)) {
      throw new Error("Invalid collection item ID.");
    }
    if (eventType !== "whatsapp_click") {
      throw new Error("An item can only be attached to a WhatsApp click.");
    }

    // The INSERT ... SELECT makes the parent/item relationship a database-side
    // condition, so a valid UUID from another collection cannot be attributed here.
    const result = await query<{ id: string }>(
      `
        INSERT INTO public.product_page_analytics_events (
          product_page_id,
          event_type,
          product_page_item_id
        )
        SELECT $1::uuid, $2, item.id
        FROM public.product_page_items item
        WHERE item.id = $3::uuid
          AND item.product_page_id = $1::uuid
        RETURNING id
      `,
      [productPageId, eventType, productPageItemId],
    );

    if (!result.rows[0]) {
      throw new Error("Collection item does not belong to this product page.");
    }
    return;
  }

  await query(
    `
      INSERT INTO public.product_page_analytics_events (
        product_page_id,
        event_type,
        product_page_item_id
      )
      VALUES ($1, $2, NULL)
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

  const itemResult = await query<{
    product_page_item_id: string;
    product_name: string;
    total: string;
  }>(
    `
      SELECT
        item.id AS product_page_item_id,
        item.product_name,
        COUNT(event.id)::text AS total
      FROM public.product_page_items item
      LEFT JOIN public.product_page_analytics_events event
        ON event.product_page_item_id = item.id
        AND event.product_page_id = item.product_page_id
        AND event.event_type = 'whatsapp_click'
        AND event.created_at >= GREATEST(
          COALESCE((
            SELECT MAX(b.created_at)
            FROM public.admin_analytics_baselines b
            WHERE b.scope_type = 'platform'
              AND b.scope_id IS NULL
              AND b.metric_key = 'whatsapp_clicks'
          ), '-infinity'::timestamptz),
          COALESCE((
            SELECT MAX(b.created_at)
            FROM public.admin_analytics_baselines b
            WHERE b.scope_type = 'product_page'
              AND b.scope_id = $1::uuid
              AND b.metric_key = 'whatsapp_clicks'
          ), '-infinity'::timestamptz)
        )
      WHERE item.product_page_id = $1::uuid
      GROUP BY item.id, item.product_name, item.position, item.created_at
      ORDER BY item.position ASC, item.created_at ASC
    `,
    [productPageId],
  );

  const analytics: ProductPageAnalytics = {
    pageViews: 0,
    whatsappClicks: 0,
    shareClicks: 0,
    itemWhatsappClicks: itemResult.rows.map((row) => ({
      productPageItemId: row.product_page_item_id,
      productName: row.product_name,
      clicks: Number(row.total),
    })),
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
