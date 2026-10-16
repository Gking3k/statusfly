import { Router } from "express";

import {
  getProductPageByEditToken,
  getPublishedProductPageBySlug,
} from "../services/productPages.js";
import { isProductPageItemForPage } from "../services/productPageCollections.js";

import {
  getProductPageAnalytics,
  recordProductPageEvent,
  type ProductPageAnalyticsEventType,
} from "../services/productPageAnalytics.js";

const router = Router();

const VALID_EVENT_TYPES: ProductPageAnalyticsEventType[] = [
  "page_view",
  "whatsapp_click",
  "share_click",
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidEditToken(token: string) {
  return /^[a-f0-9]{64}$/.test(token);
}

/*
 * ============================================================
 * PRIVATE SELLER INSIGHTS
 * ============================================================
 *
 * GET /api/product-pages/edit/:token/insights
 *
 * The private edit token is the seller's credential.
 * No seller account is required.
 */
router.get(
  "/edit/:token/insights",
  async (req, res) => {
    try {
      const { token } = req.params;

      if (
        typeof token !== "string" ||
        !isValidEditToken(token)
      ) {
        return res.status(400).json({
          error: "Invalid edit token.",
        });
      }

      const productPage =
        await getProductPageByEditToken(token);

      if (
        !productPage ||
        typeof productPage !== "object" ||
        typeof productPage.id !== "string"
      ) {
        return res.status(404).json({
          error: "Product page not found.",
        });
      }

      const analytics =
        await getProductPageAnalytics(
          productPage.id,
        );

      const pageViews =
        analytics.pageViews;

      const whatsappClicks =
        analytics.whatsappClicks;

      const shareClicks =
        analytics.shareClicks;

      const whatsappConversionRate =
        pageViews > 0
          ? Number(
              (
                (whatsappClicks /
                  pageViews) *
                100
              ).toFixed(1),
            )
          : 0;

      const shareRate =
        pageViews > 0
          ? Number(
              (
                (shareClicks /
                  pageViews) *
                100
              ).toFixed(1),
            )
          : 0;

      res.set(
        "Cache-Control",
        "no-store",
      );

      return res.status(200).json({
        insights: {
          productPageId:
            productPage.id,

          pageType:
            productPage.page_type === "collection" ? "collection" : "single",

          publicSlug:
            productPage.public_slug,

          brandName:
            productPage.brand_name,

          productName:
            productPage.page_type === "collection"
              ? productPage.collection_title || `${productPage.brand_name} Collection`
              : productPage.product_name,

          status:
            productPage.status,

          publishedAt:
            productPage.published_at,

          pageViews,

          whatsappClicks,

          shareClicks,

          itemWhatsappClicks: analytics.itemWhatsappClicks,

          whatsappConversionRate,

          shareRate,
        },
      });
    } catch (error) {
      console.error(
        "Product page insights error:",
        error,
      );

      return res.status(500).json({
        error:
          "Unable to load your page insights.",
      });
    }
  },
);

/*
 * ============================================================
 * PUBLIC PAGE ANALYTICS EVENTS
 * ============================================================
 *
 * POST /api/product-pages/:slug/events
 */
router.post(
  "/:slug/events",
  async (req, res) => {
    try {
      const { slug } =
        req.params;

      if (
        typeof slug !== "string" ||
        slug.length < 6 ||
        slug.length > 80 ||
        !/^[A-Za-z0-9-]+$/.test(
          slug,
        )
      ) {
        return res.status(400).json({
          error:
            "Invalid product page URL.",
        });
      }

      const eventType =
        req.body?.eventType;

      if (
        typeof eventType !==
          "string" ||
        !VALID_EVENT_TYPES.includes(
          eventType as ProductPageAnalyticsEventType,
        )
      ) {
        return res.status(400).json({
          error:
            "Invalid analytics event.",
        });
      }

      const productPage =
        await getPublishedProductPageBySlug(
          slug,
        );

      if (
        !productPage ||
        typeof productPage !==
          "object" ||
        !("id" in productPage)
      ) {
        return res.status(404).json({
          error:
            "Product page not found.",
        });
      }

      const productPageId =
        productPage.id;

      if (
        typeof productPageId !==
        "string"
      ) {
        return res.status(404).json({
          error:
            "Product page not found.",
        });
      }

      const itemId = req.body?.itemId;
      let productPageItemId: string | undefined;

      if (itemId !== undefined) {
        if (
          typeof itemId !== "string" ||
          !UUID_PATTERN.test(itemId) ||
          eventType !== "whatsapp_click" ||
          productPage.page_type !== "collection"
        ) {
          return res.status(400).json({ error: "Invalid collection item analytics event." });
        }

        if (!(await isProductPageItemForPage(productPageId, itemId))) {
          return res.status(400).json({ error: "The item does not belong to this collection." });
        }
        productPageItemId = itemId;
      }

      await recordProductPageEvent(
        productPageId,
        eventType as ProductPageAnalyticsEventType,
        productPageItemId,
      );

      res.set(
        "Cache-Control",
        "no-store",
      );

      return res.status(202).json({
        success: true,
      });
    } catch (error) {
      console.error(
        "Product page analytics error:",
        error,
      );

      /*
       * Analytics must never stop a customer
       * from viewing or ordering.
       */
      return res.status(202).json({
        success: false,
      });
    }
  },
);

export default router;