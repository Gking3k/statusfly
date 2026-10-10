import type { PoolClient } from "pg";
import pool, { query } from "../db.js";
import { sanitizeAuditDetails } from "./adminAudit.js";
import { deleteStoredProductImage } from "./supabaseStorage.js";

export type AdminProductPageStatus = "draft" | "published" | "hidden";
export type AdminProductPageStatusFilter =
  | "all"
  | "draft"
  | "published"
  | "hidden"
  | "archived";
export type AdminProductPageActionStatus = "published" | "hidden";

export class AdminProductPageError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = "ADMIN_PRODUCT_PAGE_ERROR") {
    super(message);
    this.name = "AdminProductPageError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

interface ListOptions {
  search: string;
  status: AdminProductPageStatusFilter;
  page: number;
  pageSize: number;
}

interface ProductPageListDbRow {
  id: string;
  public_slug: string;
  brand_name: string;
  product_name: string;
  category: string;
  price_naira: number | string;
  status: AdminProductPageStatus;
  archived_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  image_count: number | string;
  payment_count: number | string;
  successful_payment_count: number | string;
  lifetime_revenue_kobo: number | string;
  page_views: number | string;
  whatsapp_clicks: number | string;
  share_clicks: number | string;
}

function numeric(value: number | string | null | undefined): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function mapListRow(row: ProductPageListDbRow) {
  return {
    id: row.id,
    publicSlug: row.public_slug,
    brandName: row.brand_name,
    productName: row.product_name,
    category: row.category,
    priceNaira: numeric(row.price_naira),
    status: row.status,
    archivedAt: row.archived_at,
    isArchived: Boolean(row.archived_at),
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    imageCount: numeric(row.image_count),
    paymentCount: numeric(row.payment_count),
    successfulPaymentCount: numeric(row.successful_payment_count),
    lifetimeRevenueNaira: numeric(row.lifetime_revenue_kobo) / 100,
    pageViews: numeric(row.page_views),
    whatsappClicks: numeric(row.whatsapp_clicks),
    shareClicks: numeric(row.share_clicks),
  };
}

function buildListWhere(options: ListOptions) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const add = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };

  const search = options.search.trim().slice(0, 100);
  if (search) {
    const escaped = search.replace(/[\\%_]/g, "\\$&");
    const placeholder = add(`%${escaped}%`);
    clauses.push(`(
      pp.product_name ILIKE ${placeholder} ESCAPE E'\\\\'
      OR pp.brand_name ILIKE ${placeholder} ESCAPE E'\\\\'
      OR pp.public_slug ILIKE ${placeholder} ESCAPE E'\\\\'
      OR pp.category ILIKE ${placeholder} ESCAPE E'\\\\'
    )`);
  }

  if (options.status === "archived") {
    clauses.push("pp.archived_at IS NOT NULL");
  } else if (options.status !== "all") {
    const placeholder = add(options.status);
    clauses.push(`pp.archived_at IS NULL AND pp.status = ${placeholder}`);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

export async function listAdminProductPages(options: ListOptions) {
  const { whereSql, values } = buildListWhere(options);
  const countResult = await query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM public.product_pages pp ${whereSql}`,
    values,
  );

  const limitPlaceholder = `$${values.length + 1}`;
  const offsetPlaceholder = `$${values.length + 2}`;
  const listResult = await query<ProductPageListDbRow>(
    `
      SELECT
        pp.id,
        pp.public_slug,
        pp.brand_name,
        pp.product_name,
        pp.category,
        pp.price_naira,
        pp.status,
        pp.archived_at::text,
        pp.published_at::text,
        pp.created_at::text,
        pp.updated_at::text,
        (SELECT COUNT(*) FROM public.product_page_images image
          WHERE image.product_page_id = pp.id)::int AS image_count,
        (SELECT COUNT(*) FROM public.product_page_payments payment
          WHERE payment.product_page_id = pp.id)::int AS payment_count,
        (SELECT COUNT(*) FROM public.product_page_payments payment
          WHERE payment.product_page_id = pp.id AND payment.status = 'success')::int
          AS successful_payment_count,
        COALESCE((SELECT SUM(payment.amount_kobo) FROM public.product_page_payments payment
          WHERE payment.product_page_id = pp.id AND payment.status = 'success'), 0)::text
          AS lifetime_revenue_kobo,
        (SELECT COUNT(*) FROM public.product_page_analytics_events event
          WHERE event.product_page_id = pp.id AND event.event_type = 'page_view'
            AND event.created_at >= GREATEST(
              COALESCE((SELECT MAX(b.created_at) FROM public.admin_analytics_baselines b
                WHERE b.scope_type = 'platform' AND b.scope_id IS NULL AND b.metric_key = 'product_page_views'), '-infinity'::timestamptz),
              COALESCE((SELECT MAX(b.created_at) FROM public.admin_analytics_baselines b
                WHERE b.scope_type = 'product_page' AND b.scope_id = pp.id AND b.metric_key = 'product_page_views'), '-infinity'::timestamptz)
            ))::int AS page_views,
        (SELECT COUNT(*) FROM public.product_page_analytics_events event
          WHERE event.product_page_id = pp.id AND event.event_type = 'whatsapp_click'
            AND event.created_at >= GREATEST(
              COALESCE((SELECT MAX(b.created_at) FROM public.admin_analytics_baselines b
                WHERE b.scope_type = 'platform' AND b.scope_id IS NULL AND b.metric_key = 'whatsapp_clicks'), '-infinity'::timestamptz),
              COALESCE((SELECT MAX(b.created_at) FROM public.admin_analytics_baselines b
                WHERE b.scope_type = 'product_page' AND b.scope_id = pp.id AND b.metric_key = 'whatsapp_clicks'), '-infinity'::timestamptz)
            ))::int AS whatsapp_clicks,
        (SELECT COUNT(*) FROM public.product_page_analytics_events event
          WHERE event.product_page_id = pp.id AND event.event_type = 'share_click'
            AND event.created_at >= GREATEST(
              COALESCE((SELECT MAX(b.created_at) FROM public.admin_analytics_baselines b
                WHERE b.scope_type = 'platform' AND b.scope_id IS NULL AND b.metric_key = 'share_clicks'), '-infinity'::timestamptz),
              COALESCE((SELECT MAX(b.created_at) FROM public.admin_analytics_baselines b
                WHERE b.scope_type = 'product_page' AND b.scope_id = pp.id AND b.metric_key = 'share_clicks'), '-infinity'::timestamptz)
            ))::int AS share_clicks
      FROM public.product_pages pp
      ${whereSql}
      ORDER BY pp.created_at DESC, pp.id DESC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `,
    [...values, options.pageSize, (options.page - 1) * options.pageSize],
  );

  const total = numeric(countResult.rows[0]?.total);
  return {
    pages: listResult.rows.map(mapListRow),
    pagination: {
      page: options.page,
      pageSize: options.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / options.pageSize)),
    },
  };
}

export async function getAdminProductPageDetail(id: string) {
  const pageResult = await query<{
    id: string;
    public_slug: string;
    brand_name: string;
    whatsapp_number: string;
    delivery_info: string;
    product_name: string;
    category: string;
    description: string;
    selling_points: string[];
    price_naira: number | string;
    original_price_naira: number | string | null;
    promotion_text: string | null;
    promotion_end_at: string | null;
    availability: string;
    status: AdminProductPageStatus;
    archived_at: string | null;
    published_at: string | null;
    created_at: string;
    updated_at: string;
    payment_count: number | string;
    successful_payment_count: number | string;
    lifetime_revenue_kobo: number | string;
    page_views: number | string;
    whatsapp_clicks: number | string;
    share_clicks: number | string;
    feedback_count: number | string;
    average_rating: number | string | null;
  }>(
    `
      SELECT
        pp.id,
        pp.public_slug,
        pp.brand_name,
        pp.whatsapp_number,
        pp.delivery_info,
        pp.product_name,
        pp.category,
        pp.description,
        pp.selling_points,
        pp.price_naira,
        pp.original_price_naira,
        pp.promotion_text,
        pp.promotion_end_at::text,
        pp.availability,
        pp.status,
        pp.archived_at::text,
        pp.published_at::text,
        pp.created_at::text,
        pp.updated_at::text,
        (SELECT COUNT(*) FROM public.product_page_payments payment
          WHERE payment.product_page_id = pp.id)::int AS payment_count,
        (SELECT COUNT(*) FROM public.product_page_payments payment
          WHERE payment.product_page_id = pp.id AND payment.status = 'success')::int
          AS successful_payment_count,
        COALESCE((SELECT SUM(payment.amount_kobo) FROM public.product_page_payments payment
          WHERE payment.product_page_id = pp.id AND payment.status = 'success'), 0)::text
          AS lifetime_revenue_kobo,
        (SELECT COUNT(*) FROM public.product_page_analytics_events event
          WHERE event.product_page_id = pp.id AND event.event_type = 'page_view'
            AND event.created_at >= GREATEST(
              COALESCE((SELECT MAX(b.created_at) FROM public.admin_analytics_baselines b
                WHERE b.scope_type = 'platform' AND b.scope_id IS NULL AND b.metric_key = 'product_page_views'), '-infinity'::timestamptz),
              COALESCE((SELECT MAX(b.created_at) FROM public.admin_analytics_baselines b
                WHERE b.scope_type = 'product_page' AND b.scope_id = pp.id AND b.metric_key = 'product_page_views'), '-infinity'::timestamptz)
            ))::int AS page_views,
        (SELECT COUNT(*) FROM public.product_page_analytics_events event
          WHERE event.product_page_id = pp.id AND event.event_type = 'whatsapp_click'
            AND event.created_at >= GREATEST(
              COALESCE((SELECT MAX(b.created_at) FROM public.admin_analytics_baselines b
                WHERE b.scope_type = 'platform' AND b.scope_id IS NULL AND b.metric_key = 'whatsapp_clicks'), '-infinity'::timestamptz),
              COALESCE((SELECT MAX(b.created_at) FROM public.admin_analytics_baselines b
                WHERE b.scope_type = 'product_page' AND b.scope_id = pp.id AND b.metric_key = 'whatsapp_clicks'), '-infinity'::timestamptz)
            ))::int AS whatsapp_clicks,
        (SELECT COUNT(*) FROM public.product_page_analytics_events event
          WHERE event.product_page_id = pp.id AND event.event_type = 'share_click'
            AND event.created_at >= GREATEST(
              COALESCE((SELECT MAX(b.created_at) FROM public.admin_analytics_baselines b
                WHERE b.scope_type = 'platform' AND b.scope_id IS NULL AND b.metric_key = 'share_clicks'), '-infinity'::timestamptz),
              COALESCE((SELECT MAX(b.created_at) FROM public.admin_analytics_baselines b
                WHERE b.scope_type = 'product_page' AND b.scope_id = pp.id AND b.metric_key = 'share_clicks'), '-infinity'::timestamptz)
            ))::int AS share_clicks,
        (SELECT COUNT(*) FROM public.product_page_feedback feedback
          WHERE feedback.product_page_id = pp.id)::int AS feedback_count,
        (SELECT ROUND(AVG(feedback.rating)::numeric, 2) FROM public.product_page_feedback feedback
          WHERE feedback.product_page_id = pp.id)::text AS average_rating
      FROM public.product_pages pp
      WHERE pp.id = $1
      LIMIT 1
    `,
    [id],
  );

  const row = pageResult.rows[0];
  if (!row) return null;

  const imagesResult = await query<{
    id: string;
    public_url: string;
    position: number;
  }>(
    `SELECT id, public_url, position
       FROM public.product_page_images
      WHERE product_page_id = $1
      ORDER BY position ASC`,
    [id],
  );

  return {
    page: {
      id: row.id,
      publicSlug: row.public_slug,
      brandName: row.brand_name,
      whatsappNumber: row.whatsapp_number,
      deliveryInfo: row.delivery_info,
      productName: row.product_name,
      category: row.category,
      description: row.description,
      sellingPoints: Array.isArray(row.selling_points) ? row.selling_points : [],
      priceNaira: numeric(row.price_naira),
      originalPriceNaira: row.original_price_naira === null ? null : numeric(row.original_price_naira),
      promotionText: row.promotion_text,
      promotionEndAt: row.promotion_end_at,
      availability: row.availability,
      status: row.status,
      archivedAt: row.archived_at,
      isArchived: Boolean(row.archived_at),
      publishedAt: row.published_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      paymentCount: numeric(row.payment_count),
      successfulPaymentCount: numeric(row.successful_payment_count),
      lifetimeRevenueNaira: numeric(row.lifetime_revenue_kobo) / 100,
      pageViews: numeric(row.page_views),
      whatsappClicks: numeric(row.whatsapp_clicks),
      shareClicks: numeric(row.share_clicks),
      feedbackCount: numeric(row.feedback_count),
      averageRating: row.average_rating === null ? null : numeric(row.average_rating),
    },
    images: imagesResult.rows.map((image) => ({
      id: image.id,
      publicUrl: image.public_url,
      position: image.position,
    })),
  };
}

async function insertAuditEvent(
  client: PoolClient,
  input: {
    actorUsername: string;
    action: string;
    entityId: string;
    reason?: string | null;
    details?: Record<string, string | number | boolean | null>;
  },
) {
  await client.query(
    `INSERT INTO public.admin_action_logs
      (actor_username, action, entity_type, entity_id, outcome, reason, details)
     VALUES ($1, $2, 'product_page', $3, 'succeeded', $4, $5::jsonb)`,
    [
      input.actorUsername.slice(0, 100),
      input.action,
      input.entityId,
      input.reason?.trim().slice(0, 1000) || null,
      JSON.stringify(sanitizeAuditDetails(input.details)),
    ],
  );
}

async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function changeAdminProductPageStatus(
  id: string,
  nextStatus: AdminProductPageActionStatus,
  actorUsername: string,
  reason: string | null,
) {
  return withTransaction(async (client) => {
    const found = await client.query<{
      id: string;
      public_slug: string;
      product_name: string;
      status: AdminProductPageStatus;
      archived_at: string | null;
    }>(
      `SELECT id, public_slug, product_name, status, archived_at::text
         FROM public.product_pages WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const page = found.rows[0];
    if (!page) throw new AdminProductPageError("Product page not found.", 404, "NOT_FOUND");
    if (page.archived_at) {
      throw new AdminProductPageError("Restore this archived page before changing its publication status.", 409, "PAGE_ARCHIVED");
    }
    if (page.status === nextStatus) {
      throw new AdminProductPageError(`This page is already ${nextStatus}.`, 409, "STATUS_UNCHANGED");
    }

    if (nextStatus === "published") {
      const paymentCheck = await client.query<{ paid: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM public.product_page_payments
            WHERE product_page_id = $1 AND status = 'success'
         ) AS paid`,
        [id],
      );
      if (!paymentCheck.rows[0]?.paid) {
        throw new AdminProductPageError(
          "A successful payment is required before a product page can be published.",
          409,
          "PAYMENT_REQUIRED",
        );
      }
    }

    const updated = await client.query<{ id: string; status: AdminProductPageStatus }>(
      `UPDATE public.product_pages SET status = $2 WHERE id = $1
       RETURNING id, status`,
      [id, nextStatus],
    );
    await insertAuditEvent(client, {
      actorUsername,
      action: nextStatus === "published" ? "product_page.republished" : "product_page.unpublished",
      entityId: id,
      reason,
      details: { productName: page.product_name, publicSlug: page.public_slug, previousStatus: page.status, nextStatus },
    });
    return { id, status: updated.rows[0]?.status ?? nextStatus };
  });
}

export async function archiveAdminProductPage(
  id: string,
  actorUsername: string,
  reason: string | null,
) {
  return withTransaction(async (client) => {
    const found = await client.query<{
      id: string;
      public_slug: string;
      product_name: string;
      status: AdminProductPageStatus;
      archived_at: string | null;
    }>(
      `SELECT id, public_slug, product_name, status, archived_at::text
         FROM public.product_pages WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const page = found.rows[0];
    if (!page) throw new AdminProductPageError("Product page not found.", 404, "NOT_FOUND");
    if (page.archived_at) throw new AdminProductPageError("This page is already archived.", 409, "ALREADY_ARCHIVED");

    await client.query(
      `UPDATE public.product_pages SET status = 'hidden', archived_at = NOW() WHERE id = $1`,
      [id],
    );
    await insertAuditEvent(client, {
      actorUsername,
      action: "product_page.archived",
      entityId: id,
      reason,
      details: { productName: page.product_name, publicSlug: page.public_slug, previousStatus: page.status },
    });
    return { id, status: "hidden" as const, archived: true };
  });
}

export async function restoreAdminProductPage(
  id: string,
  actorUsername: string,
  reason: string | null,
) {
  return withTransaction(async (client) => {
    const found = await client.query<{
      id: string;
      public_slug: string;
      product_name: string;
      status: AdminProductPageStatus;
      archived_at: string | null;
    }>(
      `SELECT id, public_slug, product_name, status, archived_at::text
         FROM public.product_pages WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const page = found.rows[0];
    if (!page) throw new AdminProductPageError("Product page not found.", 404, "NOT_FOUND");
    if (!page.archived_at) throw new AdminProductPageError("This page is not archived.", 409, "NOT_ARCHIVED");

    await client.query(
      `UPDATE public.product_pages SET archived_at = NULL, status = 'hidden' WHERE id = $1`,
      [id],
    );
    await insertAuditEvent(client, {
      actorUsername,
      action: "product_page.restored",
      entityId: id,
      reason,
      details: { productName: page.product_name, publicSlug: page.public_slug, restoredStatus: "hidden" },
    });
    return { id, status: "hidden" as const, archived: false };
  });
}

export async function permanentlyDeleteAdminProductPage(
  id: string,
  actorUsername: string,
  reason: string | null,
) {
  const storageKeys = await withTransaction(async (client) => {
    const found = await client.query<{
      id: string;
      public_slug: string;
      product_name: string;
      archived_at: string | null;
    }>(
      `SELECT id, public_slug, product_name, archived_at::text
         FROM public.product_pages WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const page = found.rows[0];
    if (!page) throw new AdminProductPageError("Product page not found.", 404, "NOT_FOUND");
    if (!page.archived_at) {
      throw new AdminProductPageError("Archive the page before permanently deleting it.", 409, "ARCHIVE_REQUIRED");
    }

    const paymentCheck = await client.query<{ has_payments: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM public.product_page_payments WHERE product_page_id = $1) AS has_payments`,
      [id],
    );
    if (paymentCheck.rows[0]?.has_payments) {
      throw new AdminProductPageError(
        "This page has payment history. It cannot be permanently deleted; keep it archived to preserve financial records.",
        409,
        "PAYMENT_HISTORY_PROTECTED",
      );
    }

    const images = await client.query<{ storage_key: string }>(
      `SELECT storage_key FROM public.product_page_images WHERE product_page_id = $1`,
      [id],
    );
    await client.query(`DELETE FROM public.product_pages WHERE id = $1`, [id]);
    await insertAuditEvent(client, {
      actorUsername,
      action: "product_page.permanently_deleted",
      entityId: id,
      reason,
      details: { productName: page.product_name, publicSlug: page.public_slug, imageCount: images.rowCount ?? 0 },
    });
    return images.rows.map((image) => image.storage_key);
  });

  // Storage is external to PostgreSQL. A local API can use a production Supabase
  // Storage project while pointing at a separate local database, so never remove
  // storage objects outside production by default. Production cleanup remains best effort.
  if (process.env.NODE_ENV === "production") {
    for (const storageKey of storageKeys) {
      try {
        await deleteStoredProductImage(storageKey);
      } catch (error) {
        console.error("Unable to clean up archived product image after page deletion:", error);
      }
    }
  }

  return {
    deleted: true,
    imageCount: storageKeys.length,
    storageCleanup: process.env.NODE_ENV === "production" ? "attempted" as const : "skipped_non_production" as const,
  };
}
