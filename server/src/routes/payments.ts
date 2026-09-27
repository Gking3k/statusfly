import { randomBytes } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";

const router = Router();

const PAYSTACK_API_URL = "https://api.paystack.co";
const STATUSFLY_PRICE_NAIRA = 1_000;
const STATUSFLY_PRICE_KOBO = STATUSFLY_PRICE_NAIRA * 100;
const PAYMENT_CURRENCY = "NGN";
const MAX_PRODUCT_NAME_LENGTH = 48;
const PAYSTACK_TIMEOUT_MS = 10_000;

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(paymentLimiter);

interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data?: {
    authorization_url?: string;
    access_code?: string;
    reference?: string;
  };
}

interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data?: {
    status?: string;
    reference?: string;
    amount?: number;
    currency?: string;
    metadata?: unknown;
  };
}

function isValidEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

function isValidCampaignId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 10 &&
    value.length <= 100 &&
    /^[A-Za-z0-9-]+$/.test(value)
  );
}

function isValidReference(value: string) {
  return /^[A-Za-z0-9.=-]{8,100}$/.test(value);
}

function parseMetadata(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === "object") {
    return metadata as Record<string, unknown>;
  }

  if (typeof metadata === "string") {
    try {
      const parsed: unknown = JSON.parse(metadata);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore malformed metadata and fail the campaign match below.
    }
  }

  return {};
}

function createReference() {
  return `sf-${Date.now()}-${randomBytes(6).toString("hex")}`;
}

async function paystackFetch<T>(
  path: string,
  options: RequestInit,
): Promise<T> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAYSTACK_TIMEOUT_MS);

  try {
    const response = await fetch(`${PAYSTACK_API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });

    const data = (await response.json().catch(() => null)) as T | null;

    if (!response.ok || !data) {
      throw new Error("Paystack request failed.");
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

router.post("/initialize", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const { email, campaignId, productName } = req.body ?? {};

  if (!isValidEmail(email)) {
    res.status(400).json({
      success: false,
      message: "Please provide a valid email address.",
    });
    return;
  }

  if (!isValidCampaignId(campaignId)) {
    res.status(400).json({
      success: false,
      message: "Invalid campaign.",
    });
    return;
  }

  if (
    typeof productName !== "string" ||
    productName.trim().length < 2 ||
    productName.trim().length > MAX_PRODUCT_NAME_LENGTH
  ) {
    res.status(400).json({
      success: false,
      message: `Product name must be between 2 and ${MAX_PRODUCT_NAME_LENGTH} characters.`,
    });
    return;
  }

  if (!process.env.PAYSTACK_SECRET_KEY?.trim()) {
    res.status(503).json({
      success: false,
      message: "Payments are not configured yet.",
    });
    return;
  }

  const reference = createReference();

  try {
    const data = await paystackFetch<PaystackInitializeResponse>(
      "/transaction/initialize",
      {
        method: "POST",
        body: JSON.stringify({
          email,
          amount: String(STATUSFLY_PRICE_KOBO),
          currency: PAYMENT_CURRENCY,
          reference,
          metadata: JSON.stringify({
            campaignId,
            productName: productName.trim().slice(0, 100),
            product: "statusfly-static-pack",
          }),
        }),
      },
    );

    const accessCode = data.data?.access_code;

    if (!data.status || !accessCode) {
      res.status(502).json({
        success: false,
        message: data.message || "Unable to initialize payment.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      reference: data.data?.reference || reference,
      accessCode,
    });
  } catch (error) {
    console.error("Paystack initialization failed:", error);

    res.status(502).json({
      success: false,
      message: "Unable to start payment. Please try again.",
    });
  }
});

router.get("/verify/:reference", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const reference = req.params.reference;
  const campaignId = req.query.campaignId;

  if (!isValidReference(reference)) {
    res.status(400).json({
      success: false,
      message: "Invalid payment reference.",
    });
    return;
  }

  if (!isValidCampaignId(campaignId)) {
    res.status(400).json({
      success: false,
      message: "Invalid campaign.",
    });
    return;
  }

  if (!process.env.PAYSTACK_SECRET_KEY?.trim()) {
    res.status(503).json({
      success: false,
      message: "Payments are not configured yet.",
    });
    return;
  }

  try {
    const data = await paystackFetch<PaystackVerifyResponse>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
      },
    );

    const payment = data.data;
    const status = payment?.status || "unknown";

    if (!data.status || !payment) {
      res.status(200).json({
        success: true,
        verified: false,
        status,
        reference,
        message: data.message || "Payment has not been confirmed.",
      });
      return;
    }

    if (status !== "success") {
      res.status(200).json({
        success: true,
        verified: false,
        status,
        reference,
        message: "Payment is not complete yet.",
      });
      return;
    }

    const metadata = parseMetadata(payment.metadata);
    const metadataCampaignId = metadata.campaignId;
    const amountMatches = payment.amount === STATUSFLY_PRICE_KOBO;
    const currencyMatches =
      (payment.currency || "").toUpperCase() === PAYMENT_CURRENCY;
    const campaignMatches = metadataCampaignId === campaignId;
    const referenceMatches = payment.reference === reference;

    if (!amountMatches || !currencyMatches || !campaignMatches || !referenceMatches) {
      res.status(409).json({
        success: false,
        verified: false,
        status: "invalid",
        reference,
        message: "Payment could not be matched to this campaign.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      verified: true,
      status: "success",
      reference,
      message: "Payment verified successfully.",
    });
  } catch (error) {
    console.error("Paystack verification failed:", error);

    res.status(502).json({
      success: false,
      message: "Unable to verify payment right now.",
    });
  }
});

export default router;
