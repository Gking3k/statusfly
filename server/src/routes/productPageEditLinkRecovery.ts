import { createHash } from "node:crypto";
import { Router, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";

import {
  getRecoverableProductPageLinksByEmail,
  isValidPaymentEmail,
} from "../services/productPagePaymentFlow.js";
import { sendProductPageEditLinkRecoveryEmail } from "../services/email.js";

const router = Router();

const genericMessage =
  "If a paid StatusFly page is associated with that email and recovery is available, we'll send the editing link shortly. Check your inbox and spam folder.";

const recoveryRateLimitResponse: RequestHandler = (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(429).json({
    error: "Too many recovery requests. Please wait before trying again.",
  });
};

const recoveryIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: recoveryRateLimitResponse,
});

// Also limit attempts for each submitted email, so changing IPs is not enough
// to repeatedly trigger recovery emails to the same inbox.
const recoveryEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const rawEmail = typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
    return createHash("sha256").update(rawEmail, "utf8").digest("hex");
  },
  skip: (req) => {
    const rawEmail = typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
    return !isValidPaymentEmail(rawEmail);
  },
  handler: recoveryRateLimitResponse,
});

router.post(
  "/recover-edit-link",
  recoveryIpLimiter,
  recoveryEmailLimiter,
  async (req, res) => {
    res.setHeader("Cache-Control", "no-store, private, max-age=0");
    res.setHeader("Pragma", "no-cache");

    const email = typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

    if (!isValidPaymentEmail(email)) {
      return res.status(400).json({
        error: "Enter the valid email address you used at checkout.",
      });
    }

    try {
      const recoverablePages = await getRecoverableProductPageLinksByEmail(email);

      if (recoverablePages.length > 0) {
        const siteUrl = (
          process.env.PUBLIC_SITE_URL?.trim() ||
          process.env.CLIENT_URL?.trim() ||
          "https://statusfly.app"
        ).replace(/\/+$/, "");

        await sendProductPageEditLinkRecoveryEmail({
          email,
          pages: recoverablePages.map((page) => ({
            brandName: page.brandName,
            productName: page.productName,
            publicUrl: `${siteUrl}/p/${encodeURIComponent(page.publicSlug)}`,
            editUrl: `${siteUrl}/edit/${encodeURIComponent(page.editToken)}`,
          })),
        });
      }
    } catch (error) {
      // Deliberately keep the public response identical so the endpoint cannot
      // be used to discover which email addresses have paid pages.
      console.error("StatusFly edit-link recovery request failed:", error instanceof Error ? error.name : "UnknownError");
    }

    return res.status(202).json({ message: genericMessage });
  },
);

export default router;
