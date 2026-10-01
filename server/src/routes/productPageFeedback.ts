import { Router } from "express";
import rateLimit from "express-rate-limit";
import { sendProductPageFeedbackEmail } from "../services/email.js";
import { getProductPageByEditToken } from "../services/productPages.js";
import {
  createProductPageFeedback,
  type ProductPageFeedbackOutcome,
} from "../services/productPageFeedback.js";

const router = Router();

const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

const ALLOWED_OUTCOMES = new Set<ProductPageFeedbackOutcome>([
  "yes",
  "not_yet",
  "inquiry",
  "customer",
  "not_shared",
]);

function isValidEditToken(token: string) {
  return /^[a-f0-9]{64}$/.test(token);
}

function optionalString(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length > maxLength) return undefined;
  return trimmed || null;
}

router.post("/edit/:token/feedback", feedbackLimiter, async (req, res) => {
  try {
    const { token } = req.params;

    if (typeof token !== "string" || !isValidEditToken(token)) {
      return res.status(400).json({ success: false, message: "Invalid edit token." });
    }

    const page = await getProductPageByEditToken(token);

    if (!page || typeof page.id !== "string") {
      return res.status(404).json({ success: false, message: "Product page not found." });
    }

    const { rating } = req.body ?? {};

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Please provide a rating from 1 to 5." });
    }

    const outcome = req.body?.outcome ?? null;

    if (
      outcome !== null &&
      (typeof outcome !== "string" || !ALLOWED_OUTCOMES.has(outcome as ProductPageFeedbackOutcome))
    ) {
      return res.status(400).json({ success: false, message: "Please provide a valid outcome." });
    }

    const featureRequest = optionalString(req.body?.featureRequest, 120);
    const improvementText = optionalString(req.body?.improvementText, 2000);

    if (featureRequest === undefined) {
      return res.status(400).json({ success: false, message: "Feature request is too long or invalid." });
    }

    if (improvementText === undefined) {
      return res.status(400).json({ success: false, message: "Improvement feedback is too long or invalid." });
    }

    await createProductPageFeedback({
      productPageId: page.id,
      rating,
      outcome: outcome as ProductPageFeedbackOutcome | null,
      featureRequest,
      improvementText,
    });

    res.set("Cache-Control", "no-store");

    // Feedback is already safely stored in the database.
    // Send the notification separately so an email failure never makes
    // the seller think their feedback was lost.
    void sendProductPageFeedbackEmail({
      productPageId: page.id,
      brandName: String(page.brand_name ?? ""),
      productName: String(page.product_name ?? ""),
      publicSlug: String(page.public_slug ?? ""),
      rating,
      outcome: outcome as ProductPageFeedbackOutcome | null,
      featureRequest,
      improvementText,
    }).catch((error) => {
      console.error("StatusFly product page feedback email error:", error);
    });

    return res.status(201).json({
      success: true,
      message: "Thanks. Your feedback has been received.",
    });
  } catch (error) {
    console.error("Product page feedback error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to save your feedback right now.",
    });
  }
});

export default router;
