import { query } from "../db.js";

export type AdminAnalyticsRange = "7d" | "30d" | "all";

function getStartDate(range: AdminAnalyticsRange) {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function maskEmail(value: string | null) {
  if (!value) return null;
  const [local, domain] = value.split("@");
  if (!local || !domain) return value;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

const NEGATIVE_INFINITY_SQL = "'-infinity'::timestamptz";

function baselineCutoff(metricKey: string, alias = "latest_platform_baselines") {
  return `COALESCE((SELECT reset_at FROM ${alias} WHERE metric_key = '${metricKey}'), ${NEGATIVE_INFINITY_SQL})`;
}

export async function getAdminAnalytics(range: AdminAnalyticsRange) {
  const rangeStart = getStartDate(range);

  const [platformResult, productActivityResult, totalsResult, periodPaymentsResult, revenueReportingResult, periodFeedbackResult, topProductsResult, recentPaymentsResult, recentFeedbackResult] =
    await Promise.all([
      query<{
        unique_visitors: string;
        home_views: string;
        create_views: string;
        drafts_created: string;
        payment_starts: string;
        payment_init_failures: string;
        public_product_page_views: string;
      }>(
        `
          WITH latest_platform_baselines AS (
            SELECT metric_key, MAX(created_at) AS reset_at
            FROM public.admin_analytics_baselines
            WHERE scope_type = 'platform' AND scope_id IS NULL
            GROUP BY metric_key
          ), bounds AS (SELECT $1::timestamptz AS range_start)
          SELECT
            (COUNT(DISTINCT event.visitor_id) FILTER (
              WHERE event.created_at >= GREATEST(
                ${baselineCutoff("unique_visitors")},
                COALESCE(bounds.range_start, ${NEGATIVE_INFINITY_SQL})
              )
            ))::text AS unique_visitors,
            (COUNT(*) FILTER (WHERE event.event_type = 'home_view' AND event.created_at >= GREATEST(
              ${baselineCutoff("home_views")}, COALESCE(bounds.range_start, ${NEGATIVE_INFINITY_SQL})
            )))::text AS home_views,
            (COUNT(*) FILTER (WHERE event.event_type = 'create_view' AND event.created_at >= GREATEST(
              ${baselineCutoff("create_views")}, COALESCE(bounds.range_start, ${NEGATIVE_INFINITY_SQL})
            )))::text AS create_views,
            (COUNT(*) FILTER (WHERE event.event_type = 'draft_created' AND event.created_at >= GREATEST(
              ${baselineCutoff("drafts_created")}, COALESCE(bounds.range_start, ${NEGATIVE_INFINITY_SQL})
            )))::text AS drafts_created,
            (COUNT(*) FILTER (WHERE event.event_type = 'payment_started' AND event.created_at >= GREATEST(
              ${baselineCutoff("payment_starts")}, COALESCE(bounds.range_start, ${NEGATIVE_INFINITY_SQL})
            )))::text AS payment_starts,
            (COUNT(*) FILTER (WHERE event.event_type = 'payment_init_failed' AND event.created_at >= GREATEST(
              ${baselineCutoff("payment_init_failures")}, COALESCE(bounds.range_start, ${NEGATIVE_INFINITY_SQL})
            )))::text AS payment_init_failures,
            (COUNT(*) FILTER (WHERE event.event_type = 'public_product_page_view' AND event.created_at >= GREATEST(
              ${baselineCutoff("public_product_page_views")}, COALESCE(bounds.range_start, ${NEGATIVE_INFINITY_SQL})
            )))::text AS public_product_page_views
          FROM public.platform_analytics_events event
          CROSS JOIN bounds
        `,
        [rangeStart],
      ),

      query<{
        page_views: string;
        whatsapp_clicks: string;
        share_clicks: string;
      }>(
        `
          WITH latest_platform_baselines AS (
            SELECT metric_key, MAX(created_at) AS reset_at
            FROM public.admin_analytics_baselines
            WHERE scope_type = 'platform' AND scope_id IS NULL
            GROUP BY metric_key
          ), bounds AS (SELECT $1::timestamptz AS range_start)
          SELECT
            (COUNT(*) FILTER (WHERE e.event_type = 'page_view' AND e.created_at >= GREATEST(
              ${baselineCutoff("product_page_views")}, COALESCE(bounds.range_start, ${NEGATIVE_INFINITY_SQL})
            )))::text AS page_views,
            (COUNT(*) FILTER (WHERE e.event_type = 'whatsapp_click' AND e.created_at >= GREATEST(
              ${baselineCutoff("whatsapp_clicks")}, COALESCE(bounds.range_start, ${NEGATIVE_INFINITY_SQL})
            )))::text AS whatsapp_clicks,
            (COUNT(*) FILTER (WHERE e.event_type = 'share_click' AND e.created_at >= GREATEST(
              ${baselineCutoff("share_clicks")}, COALESCE(bounds.range_start, ${NEGATIVE_INFINITY_SQL})
            )))::text AS share_clicks
          FROM public.product_page_analytics_events e
          CROSS JOIN bounds
        `,
        [rangeStart],
      ),

      query<{
        total_pages: string;
        published_pages: string;
        successful_payments: string;
        total_gross_revenue_kobo: string;
        total_processed_refund_kobo: string;
        total_pending_refund_kobo: string;
        feedback_count: string;
        average_rating: string | null;
      }>(
        `
          SELECT
            (SELECT COUNT(*) FROM public.product_pages)::text AS total_pages,
            (SELECT COUNT(*) FROM public.product_pages WHERE status = 'published' AND archived_at IS NULL)::text AS published_pages,
            (SELECT COUNT(*) FROM public.product_page_payments WHERE status = 'success')::text AS successful_payments,
            (SELECT COALESCE(SUM(amount_kobo), 0) FROM public.product_page_payments WHERE status = 'success')::text AS total_gross_revenue_kobo,
            (SELECT COALESCE(SUM(refund.amount_kobo), 0)
              FROM public.admin_payment_refunds refund
              JOIN public.product_page_payments payment ON payment.id = refund.payment_id
              WHERE payment.status = 'success' AND refund.status = 'processed')::text AS total_processed_refund_kobo,
            (SELECT COALESCE(SUM(refund.amount_kobo), 0)
              FROM public.admin_payment_refunds refund
              JOIN public.product_page_payments payment ON payment.id = refund.payment_id
              WHERE payment.status = 'success' AND refund.status IN ('initiating', 'pending', 'processing', 'needs-attention', 'initiation_unknown'))::text AS total_pending_refund_kobo,
            (SELECT COUNT(*) FROM public.product_page_feedback)::text AS feedback_count,
            (SELECT ROUND(AVG(rating)::numeric, 2) FROM public.product_page_feedback)::text AS average_rating
        `,
      ),

      query<{
        successful_payments: string;
        gross_revenue_kobo: string;
        processed_refund_kobo: string;
      }>(
        `
          WITH period_payments AS (
            SELECT
              COUNT(*) FILTER (WHERE payment.status = 'success')::text AS successful_payments,
              COALESCE(SUM(payment.amount_kobo) FILTER (WHERE payment.status = 'success'), 0)::text AS gross_revenue_kobo
            FROM public.product_page_payments payment
            WHERE ($1::timestamptz IS NULL OR payment.created_at >= $1)
          ), period_refunds AS (
            SELECT COALESCE(SUM(refund.amount_kobo), 0)::text AS processed_refund_kobo
            FROM public.admin_payment_refunds refund
            JOIN public.product_page_payments payment ON payment.id = refund.payment_id
            WHERE payment.status = 'success'
              AND refund.status = 'processed'
              AND ($1::timestamptz IS NULL OR refund.processed_at >= $1)
          )
          SELECT period_payments.successful_payments,
                 period_payments.gross_revenue_kobo,
                 period_refunds.processed_refund_kobo
          FROM period_payments CROSS JOIN period_refunds
        `,
        [rangeStart],
      ),

      // This query is intentionally separate from periodPaymentsResult: resetting
      // revenue must not reset or change the Purchases card or the other payment totals.
      query<{ net_revenue_kobo: string }>(
        `
          WITH bounds AS (
            SELECT GREATEST(
              COALESCE($1::timestamptz, ${NEGATIVE_INFINITY_SQL}),
              COALESCE(
                (SELECT MAX(created_at) FROM public.admin_revenue_baselines),
                ${NEGATIVE_INFINITY_SQL}
              )
            ) AS cutoff
          ), revenue_payments AS (
            SELECT COALESCE(SUM(payment.amount_kobo), 0) AS amount_kobo
            FROM public.product_page_payments payment
            CROSS JOIN bounds
            WHERE payment.status = 'success'
              AND payment.created_at >= bounds.cutoff
          ), revenue_refunds AS (
            SELECT COALESCE(SUM(refund.amount_kobo), 0) AS amount_kobo
            FROM public.admin_payment_refunds refund
            JOIN public.product_page_payments payment ON payment.id = refund.payment_id
            CROSS JOIN bounds
            WHERE payment.status = 'success'
              AND refund.status = 'processed'
              AND refund.processed_at >= bounds.cutoff
          )
          SELECT (revenue_payments.amount_kobo - revenue_refunds.amount_kobo)::text AS net_revenue_kobo
          FROM revenue_payments CROSS JOIN revenue_refunds
        `,
        [rangeStart],
      ),

      query<{ feedback_count: string; average_rating: string | null }>(
        `
          SELECT
            COUNT(*)::text AS feedback_count,
            ROUND(AVG(rating)::numeric, 2)::text AS average_rating
          FROM public.product_page_feedback
          WHERE ($1::timestamptz IS NULL OR created_at >= $1)
        `,
        [rangeStart],
      ),

      query<{
        id: string;
        public_slug: string;
        brand_name: string;
        product_name: string;
        page_views: string;
        whatsapp_clicks: string;
        share_clicks: string;
      }>(
        `
          WITH latest_platform_baselines AS (
            SELECT metric_key, MAX(created_at) AS reset_at
            FROM public.admin_analytics_baselines
            WHERE scope_type = 'platform' AND scope_id IS NULL
            GROUP BY metric_key
          ), latest_page_baselines AS (
            SELECT scope_id, metric_key, MAX(created_at) AS reset_at
            FROM public.admin_analytics_baselines
            WHERE scope_type = 'product_page'
            GROUP BY scope_id, metric_key
          ), bounds AS (SELECT $1::timestamptz AS range_start), product_counts AS (
            SELECT
              pp.id,
              pp.public_slug,
              pp.brand_name,
              pp.product_name,
              pp.created_at,
              COUNT(e.id) FILTER (WHERE e.event_type = 'page_view' AND e.created_at >= GREATEST(
                COALESCE((SELECT reset_at FROM latest_platform_baselines WHERE metric_key = 'product_page_views'), ${NEGATIVE_INFINITY_SQL}),
                COALESCE((SELECT reset_at FROM latest_page_baselines WHERE scope_id = pp.id AND metric_key = 'product_page_views'), ${NEGATIVE_INFINITY_SQL}),
                COALESCE(bounds.range_start, ${NEGATIVE_INFINITY_SQL})
              )) AS page_views,
              COUNT(e.id) FILTER (WHERE e.event_type = 'whatsapp_click' AND e.created_at >= GREATEST(
                COALESCE((SELECT reset_at FROM latest_platform_baselines WHERE metric_key = 'whatsapp_clicks'), ${NEGATIVE_INFINITY_SQL}),
                COALESCE((SELECT reset_at FROM latest_page_baselines WHERE scope_id = pp.id AND metric_key = 'whatsapp_clicks'), ${NEGATIVE_INFINITY_SQL}),
                COALESCE(bounds.range_start, ${NEGATIVE_INFINITY_SQL})
              )) AS whatsapp_clicks,
              COUNT(e.id) FILTER (WHERE e.event_type = 'share_click' AND e.created_at >= GREATEST(
                COALESCE((SELECT reset_at FROM latest_platform_baselines WHERE metric_key = 'share_clicks'), ${NEGATIVE_INFINITY_SQL}),
                COALESCE((SELECT reset_at FROM latest_page_baselines WHERE scope_id = pp.id AND metric_key = 'share_clicks'), ${NEGATIVE_INFINITY_SQL}),
                COALESCE(bounds.range_start, ${NEGATIVE_INFINITY_SQL})
              )) AS share_clicks
            FROM public.product_pages pp
            CROSS JOIN bounds
            LEFT JOIN public.product_page_analytics_events e ON e.product_page_id = pp.id
            WHERE pp.status = 'published' AND pp.archived_at IS NULL
            GROUP BY pp.id, pp.public_slug, pp.brand_name, pp.product_name, pp.created_at, bounds.range_start
          )
          SELECT id, public_slug, brand_name, product_name,
                 page_views AS page_views,
                 whatsapp_clicks AS whatsapp_clicks,
                 share_clicks AS share_clicks
          FROM product_counts
          ORDER BY page_views DESC, whatsapp_clicks DESC, created_at DESC
          LIMIT 8
        `,
        [rangeStart],
      ),

      query<{
        reference: string;
        amount_kobo: string;
        status: string;
        customer_email: string | null;
        product_name: string;
        brand_name: string;
        created_at: string;
      }>(
        `
          SELECT
            payment.reference,
            payment.amount_kobo::text,
            payment.status,
            payment.customer_email,
            pp.product_name,
            pp.brand_name,
            payment.created_at::text
          FROM public.product_page_payments payment
          JOIN public.product_pages pp ON pp.id = payment.product_page_id
          WHERE ($1::timestamptz IS NULL OR payment.created_at >= $1)
          ORDER BY payment.created_at DESC
          LIMIT 8
        `,
        [rangeStart],
      ),

      query<{
        rating: number;
        outcome: string | null;
        feature_request: string | null;
        improvement_text: string | null;
        product_name: string | null;
        brand_name: string | null;
        created_at: string;
      }>(
        `
          SELECT
            feedback.rating,
            feedback.outcome,
            feedback.feature_request,
            feedback.improvement_text,
            pp.product_name,
            pp.brand_name,
            feedback.created_at::text
          FROM public.product_page_feedback feedback
          LEFT JOIN public.product_pages pp ON pp.id = feedback.product_page_id
          WHERE ($1::timestamptz IS NULL OR feedback.created_at >= $1)
          ORDER BY feedback.created_at DESC
          LIMIT 8
        `,
        [rangeStart],
      ),
    ]);

  const platform = platformResult.rows[0] ?? {
    unique_visitors: "0", home_views: "0", create_views: "0", drafts_created: "0",
    payment_starts: "0", payment_init_failures: "0", public_product_page_views: "0",
  };
  const activity = productActivityResult.rows[0] ?? { page_views: "0", whatsapp_clicks: "0", share_clicks: "0" };
  const totals = totalsResult.rows[0] ?? {
    total_pages: "0", published_pages: "0", successful_payments: "0", total_gross_revenue_kobo: "0",
    total_processed_refund_kobo: "0", total_pending_refund_kobo: "0", feedback_count: "0", average_rating: null,
  };
  const periodPayments = periodPaymentsResult.rows[0] ?? {
    successful_payments: "0", gross_revenue_kobo: "0", processed_refund_kobo: "0",
  };
  const revenueReporting = revenueReportingResult.rows[0] ?? { net_revenue_kobo: "0" };
  const totalGrossRevenueKobo = toNumber(totals.total_gross_revenue_kobo);
  const totalProcessedRefundKobo = toNumber(totals.total_processed_refund_kobo);
  const totalPendingRefundKobo = toNumber(totals.total_pending_refund_kobo);
  const periodGrossRevenueKobo = toNumber(periodPayments.gross_revenue_kobo);
  const periodProcessedRefundKobo = toNumber(periodPayments.processed_refund_kobo);
  const periodFeedback = periodFeedbackResult.rows[0] ?? { feedback_count: "0", average_rating: null };

  return {
    range,
    generatedAt: new Date().toISOString(),
    visitors: {
      unique: toNumber(platform.unique_visitors),
      homeViews: toNumber(platform.home_views),
      createViews: toNumber(platform.create_views),
      publicProductPageViews: toNumber(platform.public_product_page_views),
    },
    funnel: {
      draftsCreated: toNumber(platform.drafts_created),
      paymentStarts: toNumber(platform.payment_starts),
      paymentInitFailures: toNumber(platform.payment_init_failures),
      successfulPayments: toNumber(periodPayments.successful_payments),
      publishedPages: toNumber(totals.published_pages),
    },
    productActivity: {
      pageViews: toNumber(activity.page_views),
      whatsappClicks: toNumber(activity.whatsapp_clicks),
      shareClicks: toNumber(activity.share_clicks),
    },
    business: {
      totalPages: toNumber(totals.total_pages),
      totalPublishedPages: toNumber(totals.published_pages),
      totalSuccessfulPayments: toNumber(totals.successful_payments),
      totalGrossRevenueNaira: totalGrossRevenueKobo / 100,
      totalProcessedRefundNaira: totalProcessedRefundKobo / 100,
      totalPendingRefundNaira: totalPendingRefundKobo / 100,
      totalRevenueNaira: (totalGrossRevenueKobo - totalProcessedRefundKobo) / 100,
      periodSuccessfulPayments: toNumber(periodPayments.successful_payments),
      periodGrossRevenueNaira: periodGrossRevenueKobo / 100,
      periodProcessedRefundNaira: periodProcessedRefundKobo / 100,
      periodRevenueNaira: toNumber(revenueReporting.net_revenue_kobo) / 100,
      periodFeedbackCount: toNumber(periodFeedback.feedback_count),
      periodAverageRating: periodFeedback.average_rating === null ? null : toNumber(periodFeedback.average_rating),
      totalFeedbackCount: toNumber(totals.feedback_count),
      totalAverageRating: totals.average_rating === null ? null : toNumber(totals.average_rating),
    },
    topProducts: topProductsResult.rows.map((row) => ({
      publicSlug: row.public_slug,
      brandName: row.brand_name,
      productName: row.product_name,
      pageViews: toNumber(row.page_views),
      whatsappClicks: toNumber(row.whatsapp_clicks),
      shareClicks: toNumber(row.share_clicks),
    })),
    recentPayments: recentPaymentsResult.rows.map((row) => ({
      reference: row.reference,
      amountNaira: toNumber(row.amount_kobo) / 100,
      status: row.status,
      customerEmail: maskEmail(row.customer_email),
      productName: row.product_name,
      brandName: row.brand_name,
      createdAt: row.created_at,
    })),
    recentFeedback: recentFeedbackResult.rows.map((row) => ({
      rating: row.rating,
      outcome: row.outcome,
      featureRequest: row.feature_request,
      improvementText: row.improvement_text,
      productName: row.product_name,
      brandName: row.brand_name,
      createdAt: row.created_at,
    })),
  };
}
