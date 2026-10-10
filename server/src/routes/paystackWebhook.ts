import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import { Router } from "express";

import {
  STATUSFLY_PRODUCT_PAGE_CURRENCY,
  STATUSFLY_PRODUCT_PAGE_PAYMENT_TYPE,
  STATUSFLY_PRODUCT_PAGE_PRICE_KOBO,
  fulfillSuccessfulProductPagePayment,
  getProductPagePaymentByReference,
} from "../services/productPagePaymentFlow.js";
import { recordAdminRefundWebhook } from "../services/adminPayments.js";

const router = Router();

const STATUSFLY_PRICE_KOBO =
  100_000;

const PAYMENT_CURRENCY =
  "NGN";

function verifyPaystackSignature(
  rawBody: Buffer,
  signature: string,
): boolean {
  const secret =
    process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!secret) {
    return false;
  }

  const expected =
    createHmac(
      "sha512",
      secret,
    )
      .update(rawBody)
      .digest("hex");

  const receivedBuffer =
    Buffer.from(
      signature,
      "utf8",
    );

  const expectedBuffer =
    Buffer.from(
      expected,
      "utf8",
    );

  return (
    receivedBuffer.length ===
      expectedBuffer.length &&
    timingSafeEqual(
      receivedBuffer,
      expectedBuffer,
    )
  );
}

function parseMetadata(
  value: unknown,
): Record<string, unknown> {
  if (
    value &&
    typeof value === "object"
  ) {
    return value as Record<
      string,
      unknown
    >;
  }

  if (
    typeof value === "string"
  ) {
    try {
      const parsed: unknown =
        JSON.parse(value);

      if (
        parsed &&
        typeof parsed ===
          "object"
      ) {
        return parsed as Record<
          string,
          unknown
        >;
      }
    } catch {
      // Treat malformed metadata as empty.
    }
  }

  return {};
}

router.post(
  "/",
  async (req, res) => {
    const signature =
      req.headers[
        "x-paystack-signature"
      ];

    if (
      typeof signature !==
      "string"
    ) {
      res
        .status(401)
        .send(
          "Invalid webhook signature.",
        );
      return;
    }

    if (
      !Buffer.isBuffer(
        req.body,
      )
    ) {
      res
        .status(400)
        .send(
          "Invalid webhook body.",
        );
      return;
    }

    if (
      !verifyPaystackSignature(
        req.body,
        signature,
      )
    ) {
      res
        .status(401)
        .send(
          "Invalid webhook signature.",
        );
      return;
    }

    let event: unknown;

    try {
      event = JSON.parse(
        req.body.toString(
          "utf8",
        ),
      );
    } catch {
      res
        .status(400)
        .send(
          "Invalid JSON payload.",
        );
      return;
    }

    const eventRecord =
      event &&
      typeof event === "object"
        ? (event as Record<
            string,
            unknown
          >)
        : {};

    const eventName =
      typeof eventRecord.event ===
      "string"
        ? eventRecord.event
        : "";

    if (eventName.startsWith("refund.")) {
      const refundData = eventRecord.data && typeof eventRecord.data === "object"
        ? eventRecord.data as Record<string, unknown>
        : {};
      const nestedTransaction = refundData.transaction && typeof refundData.transaction === "object"
        ? refundData.transaction as Record<string, unknown>
        : {};
      const transactionReference =
        (typeof refundData.transaction_reference === "string" && refundData.transaction_reference) ||
        (typeof nestedTransaction.reference === "string" && nestedTransaction.reference) ||
        (typeof refundData.reference === "string" && refundData.reference) ||
        "";
      const rawRefundId = refundData.id ?? refundData.refund_id ?? refundData.refund_reference;
      const parsedRefundId = typeof rawRefundId === "number"
        ? rawRefundId
        : typeof rawRefundId === "string" && /^\d+$/.test(rawRefundId)
          ? Number(rawRefundId)
          : null;
      const rawAmount = refundData.amount;
      const parsedAmount = typeof rawAmount === "number"
        ? rawAmount
        : typeof rawAmount === "string" && /^\d+$/.test(rawAmount)
          ? Number(rawAmount)
          : NaN;

      try {
        await recordAdminRefundWebhook({
          event: eventName,
          transactionReference,
          refundId: Number.isSafeInteger(parsedRefundId) && Number(parsedRefundId) > 0
            ? Number(parsedRefundId)
            : null,
          amountKobo: Number.isSafeInteger(parsedAmount) && parsedAmount > 0 ? parsedAmount : null,
          providerMessage: typeof refundData.message === "string" ? refundData.message : null,
        });
        res.sendStatus(200);
      } catch (error) {
        console.error("Unable to persist Paystack refund webhook event:", error);
        // Return a failure so Paystack can retry the event rather than losing
        // refund-state reconciliation during a temporary database outage.
        res.sendStatus(500);
      }
      return;
    }

    if (eventName !== "charge.success") {
      console.log(
        `Paystack webhook received: ${eventName || "unknown event"}`,
      );

      res.sendStatus(200);
      return;
    }

    const data =
      eventRecord.data &&
      typeof eventRecord.data ===
        "object"
        ? (eventRecord.data as Record<
            string,
            unknown
          >)
        : {};

    const status =
      typeof data.status ===
      "string"
        ? data.status
        : "";

    const reference =
      typeof data.reference ===
      "string"
        ? data.reference
        : "";

    const amount =
      typeof data.amount ===
      "number"
        ? data.amount
        : Number(
            data.amount,
          );

    const currency =
      typeof data.currency ===
      "string"
        ? data.currency.toUpperCase()
        : "";

    const metadata =
      parseMetadata(
        data.metadata,
      );

    const campaignId =
      typeof metadata.campaignId ===
      "string"
        ? metadata.campaignId
        : "";

    const productName =
      typeof metadata.productName ===
      "string"
        ? metadata.productName
        : "";

    const productPageId =
      typeof metadata.productPageId ===
      "string"
        ? metadata.productPageId
        : "";

    const isProductPagePayment =
      metadata.type ===
      STATUSFLY_PRODUCT_PAGE_PAYMENT_TYPE;

    if (
      isProductPagePayment
    ) {
      const isValidProductPagePayment =
        status === "success" &&
        amount ===
          STATUSFLY_PRODUCT_PAGE_PRICE_KOBO &&
        currency ===
          STATUSFLY_PRODUCT_PAGE_CURRENCY &&
        reference.length > 0 &&
        productPageId.length > 0;

      if (
        !isValidProductPagePayment
      ) {
        console.warn(
          "Invalid StatusFly product-page Paystack webhook event.",
          {
            reference,
            status,
            amount,
            currency,
            productPageId,
          },
        );

        res.sendStatus(200);
        return;
      }

      try {
        const localPayment =
          await getProductPagePaymentByReference(
            reference,
          );

        if (
          !localPayment ||
          localPayment.productPageId !==
            productPageId
        ) {
          console.warn(
            `StatusFly product-page webhook reference ${reference} did not match the stored product page.`,
          );

          res.sendStatus(200);
          return;
        }

        const fulfilled =
          await fulfillSuccessfulProductPagePayment(
            reference,
            "webhook",
          );

        if (!fulfilled) {
          console.warn(
            `StatusFly product-page webhook could not fulfill reference ${reference}.`,
          );

          res.sendStatus(200);
          return;
        }

        console.log(
          "StatusFly product-page payment webhook confirmed.",
          {
            reference,
            productPageId,
            amount,
            currency,
            publicSlug:
              fulfilled.publicSlug,
            emailSent:
              fulfilled.emailSent,
          },
        );
      } catch (error) {
        console.error(
          `StatusFly product-page webhook fulfillment failed for ${reference}:`,
          error,
        );
      }

      res.sendStatus(200);
      return;
    }

    const isValidStatusFlyPayment =
      status === "success" &&
      amount ===
        STATUSFLY_PRICE_KOBO &&
      currency ===
        PAYMENT_CURRENCY &&
      reference.length > 0 &&
      campaignId.length > 0 &&
      metadata.product ===
        "statusfly-static-pack";

    if (
      !isValidStatusFlyPayment
    ) {
      console.warn(
        "Unmatched StatusFly Paystack webhook event.",
        {
          reference,
          status,
          amount,
          currency,
          campaignId,
          productName,
        },
      );

      res.sendStatus(200);
      return;
    }

    /*
     * Legacy static-pack behavior is intentionally preserved.
     */
    console.log(
      "StatusFly payment webhook confirmed.",
      {
        reference,
        campaignId,
        productName,
        amount,
        currency,
      },
    );

    res.sendStatus(200);
  },
);

export default router;