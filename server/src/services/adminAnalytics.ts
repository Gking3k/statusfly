import { query } from "../db.js";

export type AdminAnalyticsRange = "7d" | "30d" | "all";

function getStartDate(range: AdminAnalyticsRange) {
  if (range === "all") {
    return null;
  }

  const days = range === "7d" ? 7 : 30;
  return new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  );
}

function buildCreatedAtFilter(
  range: AdminAnalyticsRange,
  parameterIndex: number,
) {
  return range === "all"
    ? { clause: "", values: [] as unknown[] }
    : {
        clause: `WHERE created_at >= $${parameterIndex}`,
        values: [getStartDate(range)],
      };
}

function buildJoinCreatedAtFilter(
  range: AdminAnalyticsRange,
  parameterIndex: number,
) {
  return range === "all"
    ? { clause: "", values: [] as unknown[] }
    : {
        clause: `AND e.created_at >= $${parameterIndex}`,
        values: [getStartDate(range)],
      };
}

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function maskEmail(value: string | null) {
  if (!value) {
    return null;
  }

  const [local, domain] = value.split("@");
  if (!local || !domain) {
    return value;
  }

  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

export async function getAdminAnalytics(
  range: AdminAnalyticsRange,
) {
  const eventFilter = buildCreatedAtFilter(range, 1);
  const productEventFilter = buildJoinCreatedAtFilter(range, 1);

  const [platformResult, productActivityResult, totalsResult, periodPaymentsResult, periodFeedbackResult, topProductsResult, recentPaymentsResult, recentFeedbackResult] =
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
          SELECT
            COUNT(DISTINCT visitor_id)::text AS unique_visitors,
            COUNT(*) FILTER (WHERE event_type = 'home_view')::text AS home_views,
            COUNT(*) FILTER (WHERE event_type = 'create_view')::text AS create_views,
            COUNT(*) FILTER (WHERE event_type = 'draft_created')::text AS drafts_created,
            COUNT(*) FILTER (WHERE event_type = 'payment_started')::text AS payment_starts,
            COUNT(*) FILTER (WHERE event_type = 'payment_init_failed')::text AS payment_init_failures,
            COUNT(*) FILTER (WHERE event_type = 'public_product_page_view')::text AS public_product_page_views
          FROM platform_analytics_events
          ${eventFilter.clause}
        `,
        eventFilter.values,
      ),

      query<{
        page_views: string;
        whatsapp_clicks: string;
        share_clicks: string;
      }>(
        `
          SELECT
            COUNT(*) FILTER (WHERE e.event_type = 'page_view')::text AS page_views,
            COUNT(*) FILTER (WHERE e.event_type = 'whatsapp_click')::text AS whatsapp_clicks,
            COUNT(*) FILTER (WHERE e.event_type = 'share_click')::text AS share_clicks
          FROM product_page_analytics_events e
          ${range === "all" ? "" : "WHERE e.created_at >= $1"}
        `,
        range === "all" ? [] : [getStartDate(range)],
      ),

      query<{
        total_pages: string;
        published_pages: string;
        successful_payments: string;
        total_revenue_kobo: string;
        feedback_count: string;
        average_rating: string | null;
      }>(
        `
          SELECT
            (SELECT COUNT(*) FROM product_pages)::text AS total_pages,
            (SELECT COUNT(*) FROM product_pages WHERE status = 'published')::text AS published_pages,
            (SELECT COUNT(*) FROM product_page_payments WHERE status = 'success')::text AS successful_payments,
            (SELECT COALESCE(SUM(amount_kobo), 0) FROM product_page_payments WHERE status = 'success')::text AS total_revenue_kobo,
            (SELECT COUNT(*) FROM product_page_feedback)::text AS feedback_count,
            (SELECT ROUND(AVG(rating)::numeric, 2) FROM product_page_feedback)::text AS average_rating
        `,
      ),

      query<{
        successful_payments: string;
        revenue_kobo: string;
      }>(
        `
          SELECT
            COUNT(*) FILTER (WHERE status = 'success')::text AS successful_payments,
            COALESCE(SUM(amount_kobo) FILTER (WHERE status = 'success'), 0)::text AS revenue_kobo
          FROM product_page_payments
          ${eventFilter.clause}
        `,
        eventFilter.values,
      ),

      query<{
        feedback_count: string;
        average_rating: string | null;
      }>(
        `
          SELECT
            COUNT(*)::text AS feedback_count,
            ROUND(AVG(rating)::numeric, 2)::text AS average_rating
          FROM product_page_feedback
          ${eventFilter.clause}
        `,
        eventFilter.values,
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
          SELECT
            pp.id,
            pp.public_slug,
            pp.brand_name,
            pp.product_name,
            COUNT(*) FILTER (WHERE e.event_type = 'page_view')::text AS page_views,
            COUNT(*) FILTER (WHERE e.event_type = 'whatsapp_click')::text AS whatsapp_clicks,
            COUNT(*) FILTER (WHERE e.event_type = 'share_click')::text AS share_clicks
          FROM product_pages pp
          LEFT JOIN product_page_analytics_events e
            ON e.product_page_id = pp.id
            ${productEventFilter.clause}
          WHERE pp.status = 'published'
          GROUP BY pp.id, pp.public_slug, pp.brand_name, pp.product_name
          ORDER BY page_views DESC, whatsapp_clicks DESC, pp.created_at DESC
          LIMIT 8
        `,
        productEventFilter.values,
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
          FROM product_page_payments payment
          JOIN product_pages pp ON pp.id = payment.product_page_id
          ${range === "all" ? "" : "WHERE payment.created_at >= $1"}
          ORDER BY payment.created_at DESC
          LIMIT 8
        `,
        range === "all" ? [] : [getStartDate(range)],
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
          FROM product_page_feedback feedback
          LEFT JOIN product_pages pp ON pp.id = feedback.product_page_id
          ${range === "all" ? "" : "WHERE feedback.created_at >= $1"}
          ORDER BY feedback.created_at DESC
          LIMIT 8
        `,
        range === "all" ? [] : [getStartDate(range)],
      ),
    ]);

  const platform = platformResult.rows[0] ?? {
    unique_visitors: "0",
    home_views: "0",
    create_views: "0",
    drafts_created: "0",
    payment_starts: "0",
    payment_init_failures: "0",
    public_product_page_views: "0",
  };

  const activity = productActivityResult.rows[0] ?? {
    page_views: "0",
    whatsapp_clicks: "0",
    share_clicks: "0",
  };

  const totals = totalsResult.rows[0] ?? {
    total_pages: "0",
    published_pages: "0",
    successful_payments: "0",
    total_revenue_kobo: "0",
    feedback_count: "0",
    average_rating: null,
  };

  const periodPayments = periodPaymentsResult.rows[0] ?? {
    successful_payments: "0",
    revenue_kobo: "0",
  };

  const periodFeedback = periodFeedbackResult.rows[0] ?? {
    feedback_count: "0",
    average_rating: null,
  };

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
      totalRevenueNaira:
        toNumber(totals.total_revenue_kobo) / 100,
      periodSuccessfulPayments: toNumber(
        periodPayments.successful_payments,
      ),
      periodRevenueNaira:
        toNumber(periodPayments.revenue_kobo) / 100,
      periodFeedbackCount: toNumber(
        periodFeedback.feedback_count,
      ),
      periodAverageRating:
        periodFeedback.average_rating === null
          ? null
          : toNumber(periodFeedback.average_rating),
      totalFeedbackCount: toNumber(totals.feedback_count),
      totalAverageRating:
        totals.average_rating === null
          ? null
          : toNumber(totals.average_rating),
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
