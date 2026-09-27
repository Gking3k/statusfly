import { createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";

const router = Router();

const STATUSFLY_PRICE_KOBO = 100_000;
const PAYMENT_CURRENCY = "NGN";

function verifyPaystackSignature(
  rawBody: Buffer,
  signature: string,
): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!secret) {
    return false;
  }

  const expected = createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);

      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Treat malformed metadata as empty.
    }
  }

  return {};
}

router.post("/", (req, res) => {
  const signature = req.headers["x-paystack-signature"];

  if (typeof signature !== "string") {
    res.status(401).send("Invalid webhook signature.");
    return;
  }

  if (!Buffer.isBuffer(req.body)) {
    res.status(400).send("Invalid webhook body.");
    return;
  }

  if (!verifyPaystackSignature(req.body, signature)) {
    res.status(401).send("Invalid webhook signature.");
    return;
  }

  let event: unknown;

  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    res.status(400).send("Invalid JSON payload.");
    return;
  }

  const eventRecord =
    event && typeof event === "object"
      ? (event as Record<string, unknown>)
      : {};

  const eventName =
    typeof eventRecord.event === "string"
      ? eventRecord.event
      : "";

  if (eventName !== "charge.success") {
    console.log(
      `Paystack webhook received: ${eventName || "unknown event"}`,
    );
    res.sendStatus(200);
    return;
  }

  const data =
    eventRecord.data &&
    typeof eventRecord.data === "object"
      ? (eventRecord.data as Record<string, unknown>)
      : {};

  const status =
    typeof data.status === "string"
      ? data.status
      : "";

  const reference =
    typeof data.reference === "string"
      ? data.reference
      : "";

  const amount =
    typeof data.amount === "number"
      ? data.amount
      : Number(data.amount);

  const currency =
    typeof data.currency === "string"
      ? data.currency.toUpperCase()
      : "";

  const metadata = parseMetadata(data.metadata);

  const campaignId =
    typeof metadata.campaignId === "string"
      ? metadata.campaignId
      : "";

  const productName =
    typeof metadata.productName === "string"
      ? metadata.productName
      : "";

  const isValidStatusFlyPayment =
    status === "success" &&
    amount === STATUSFLY_PRICE_KOBO &&
    currency === PAYMENT_CURRENCY &&
    reference.length > 0 &&
    campaignId.length > 0 &&
    metadata.product === "statusfly-static-pack";

  if (!isValidStatusFlyPayment) {
    console.warn("Unmatched StatusFly Paystack webhook event.", {
      reference,
      status,
      amount,
      currency,
      campaignId,
      productName,
    });

    res.sendStatus(200);
    return;
  }

  /*
   * Current MVP:
   * The browser still uses /api/payments/verify/:reference as its
   * synchronous confirmation path. The webhook is the server-side
   * notification path and is logged for monitoring.
   *
   * When persistent purchase storage is added, this block becomes
   * the idempotent database finalization point.
   */
  console.log("StatusFly payment webhook confirmed.", {
    reference,
    campaignId,
    productName,
    amount,
    currency,
  });

  res.sendStatus(200);
});

export default router;
