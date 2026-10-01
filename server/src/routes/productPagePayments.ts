import type { Request } from "express";
import { Router } from "express";

import {
  getProductPageByEditToken,
} from "../services/productPages.js";

import {
  STATUSFLY_PRODUCT_PAGE_CURRENCY,
  STATUSFLY_PRODUCT_PAGE_PAYMENT_TYPE,
  STATUSFLY_PRODUCT_PAGE_PRICE_KOBO,
  createPendingProductPagePayment,
  createProductPagePaymentReference,
  fulfillSuccessfulProductPagePayment,
  getProductPagePaymentByReference,
  isValidPaymentEmail,
  markProductPagePaymentFailed,
  markProductPagePaymentInvalid,
  storeProductPagePaymentEditToken,
} from "../services/productPagePaymentFlow.js";

const router = Router();

const PAYSTACK_INITIALIZE_URL =
  "https://api.paystack.co/transaction/initialize";

const PAYSTACK_VERIFY_URL =
  "https://api.paystack.co/transaction/verify";

function isValidEditToken(
  token: string,
) {
  return /^[a-f0-9]{64}$/.test(
    token,
  );
}

function resolveClientOrigin(
  req: Request,
) {
  const requestOrigin =
    typeof req.headers.origin ===
    "string"
      ? req.headers.origin.trim()
      : "";

  const configuredOrigin =
    process.env.CLIENT_URL?.trim() ??
    "";

  const allowedOrigins =
    new Set(
      [
        configuredOrigin,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ].filter(Boolean),
    );

  if (
    requestOrigin &&
    allowedOrigins.has(
      requestOrigin,
    )
  ) {
    return requestOrigin;
  }

  if (configuredOrigin) {
    return configuredOrigin;
  }

  return "http://localhost:5173";
}

function parsePaystackMetadata(
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
      return {};
    }
  }

  return {};
}

async function paystackRequest(
  url: string,
  init: {
    method?: string;
    body?: string;
    headers?: Record<
      string,
      string
    >;
  },
) {
  const secret =
    process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!secret) {
    throw new Error(
      "Paystack is not configured.",
    );
  }

  const response =
    await fetch(url, {
      ...init,
      headers: {
        Authorization:
          `Bearer ${secret}`,
        "Content-Type":
          "application/json",
        Accept:
          "application/json",
        ...(init.headers ?? {}),
      },
    });

  const data =
    (await response
      .json()
      .catch(() => null)) as
      | Record<string, unknown>
      | null;

  if (!response.ok) {
    const message =
      data &&
      typeof data.message ===
        "string"
        ? data.message
        : "Paystack request failed.";

    throw new Error(
      message,
    );
  }

  return data;
}

router.post(
  "/edit/:token/payment/initialize",
  async (req, res) => {
    try {
      const { token } =
        req.params;

      if (
        typeof token !==
          "string" ||
        !isValidEditToken(token)
      ) {
        return res.status(400).json({
          error:
            "Invalid edit token.",
        });
      }

      const email =
        typeof req.body?.email ===
        "string"
          ? req.body.email
              .trim()
              .toLowerCase()
          : "";

      if (
        !isValidPaymentEmail(
          email,
        )
      ) {
        return res.status(400).json({
          error:
            "Enter a valid email address for your payment receipt and page access email.",
        });
      }

      const page =
        await getProductPageByEditToken(
          token,
        );

      if (!page) {
        return res.status(404).json({
          error:
            "Product page not found.",
        });
      }

      if (
        page.status ===
        "published"
      ) {
        return res.status(409).json({
          error:
            "This product page has already been published.",
        });
      }

      if (
        typeof page.id !==
        "string"
      ) {
        return res.status(500).json({
          error:
            "Invalid product page identifier.",
        });
      }

      const reference =
        createProductPagePaymentReference();

      await createPendingProductPagePayment(
        page.id,
        reference,
        email,
      );

      /*
       * Keep the normal edit token hashed
       * in product_pages.
       *
       * Store a separate encrypted copy only
       * so we can send the seller their private
       * edit link after successful payment.
       */
      await storeProductPagePaymentEditToken(
        reference,
        token,
      );

      const callbackUrl =
        `${resolveClientOrigin(req)}/payment/success`;

      try {
        const data =
          await paystackRequest(
            PAYSTACK_INITIALIZE_URL,
            {
              method: "POST",
              body: JSON.stringify({
                email,
                amount:
                  STATUSFLY_PRODUCT_PAGE_PRICE_KOBO,
                currency:
                  STATUSFLY_PRODUCT_PAGE_CURRENCY,
                reference,
                callback_url:
                  callbackUrl,
                metadata: {
                  type:
                    STATUSFLY_PRODUCT_PAGE_PAYMENT_TYPE,
                  productPageId:
                    page.id,
                  publicSlug:
                    page.public_slug,
                },
              }),
            },
          );

        const paystackData =
          data &&
          typeof data.data ===
            "object" &&
          data.data
            ? (data.data as Record<
                string,
                unknown
              >)
            : {};

        const authorizationUrl =
          typeof paystackData.authorization_url ===
          "string"
            ? paystackData.authorization_url
            : "";

        const paystackReference =
          typeof paystackData.reference ===
          "string"
            ? paystackData.reference
            : "";

        if (
          !authorizationUrl ||
          paystackReference !==
            reference
        ) {
          throw new Error(
            "Paystack returned an invalid payment session.",
          );
        }

        return res.status(200).json({
          authorizationUrl,
          reference,
          amountKobo:
            STATUSFLY_PRODUCT_PAGE_PRICE_KOBO,
          currency:
            STATUSFLY_PRODUCT_PAGE_CURRENCY,
        });
      } catch (
        paymentError
      ) {
        console.error(
          "Product page Paystack initialization failed:",
          paymentError,
        );

        return res.status(502).json({
          error:
            paymentError instanceof
            Error
              ? paymentError.message
              : "Unable to start the payment.",
          reference,
        });
      }
    } catch (error) {
      console.error(
        "Product page payment initialization error:",
        error,
      );

      return res.status(500).json({
        error:
          "Unable to start payment right now.",
      });
    }
  },
);

router.get(
  "/payment/verify/:reference",
  async (req, res) => {
    try {
      const { reference } =
        req.params;

      if (
        typeof reference !==
          "string" ||
        !/^[A-Za-z0-9._-]{1,100}$/.test(
          reference,
        )
      ) {
        return res.status(400).json({
          error:
            "Invalid payment reference.",
        });
      }

      const localPayment =
        await getProductPagePaymentByReference(
          reference,
        );

      if (!localPayment) {
        return res.status(404).json({
          error:
            "Payment reference not found.",
        });
      }

      if (
        localPayment.status ===
        "success"
      ) {
        const result =
          await fulfillSuccessfulProductPagePayment(
            reference,
            "browser",
          );

        if (!result) {
          return res.status(500).json({
            error:
              "Payment is confirmed, but the product page could not be published.",
          });
        }

        return res.status(200).json({
          success: true,
          alreadyVerified: true,
          publicSlug:
            result.publicSlug,
          productPageId:
            result.payment
              .productPageId,
          emailSent:
            result.emailSent,
        });
      }

      const data =
        await paystackRequest(
          `${PAYSTACK_VERIFY_URL}/${encodeURIComponent(reference)}`,
          {
            method: "GET",
          },
        );

      const paystackStatus =
        data?.status === true;

      const paystackData =
        data &&
        typeof data.data ===
          "object" &&
        data.data
          ? (data.data as Record<
              string,
              unknown
            >)
          : {};

      const paystackReference =
        typeof paystackData.reference ===
        "string"
          ? paystackData.reference
          : "";

      const transactionStatus =
        typeof paystackData.status ===
        "string"
          ? paystackData.status.toLowerCase()
          : "";

      const amount =
        typeof paystackData.amount ===
        "number"
          ? paystackData.amount
          : Number(
              paystackData.amount,
            );

      const currency =
        typeof paystackData.currency ===
        "string"
          ? paystackData.currency.toUpperCase()
          : "";

      const metadata =
        parsePaystackMetadata(
          paystackData.metadata,
        );

      const paymentType =
        typeof metadata.type === "string"
          ? metadata.type
          : "";

      const productPageId =
        typeof metadata.productPageId === "string"
          ? metadata.productPageId
          : "";

      if (
        !paystackStatus ||
        paystackReference !== reference ||
        transactionStatus !== "success" ||
        amount !== STATUSFLY_PRODUCT_PAGE_PRICE_KOBO ||
        currency !== STATUSFLY_PRODUCT_PAGE_CURRENCY ||
        paymentType !== STATUSFLY_PRODUCT_PAGE_PAYMENT_TYPE ||
        productPageId !== localPayment.productPageId
      ) {
        if (
          transactionStatus ===
          "failed"
        ) {
          await markProductPagePaymentFailed(
            reference,
          );
        } else {
          await markProductPagePaymentInvalid(
            reference,
          );
        }

        return res.status(402).json({
          error:
            "Payment could not be verified.",
        });
      }

      const fulfilled =
        await fulfillSuccessfulProductPagePayment(
          reference,
          "browser",
        );

      if (!fulfilled) {
        return res.status(500).json({
          error:
            "Payment was verified, but publishing could not be completed.",
        });
      }

      return res.status(200).json({
        success: true,
        alreadyVerified: false,
        publicSlug:
          fulfilled.publicSlug,
        productPageId:
          fulfilled.payment
            .productPageId,
        emailSent:
          fulfilled.emailSent,
      });
    } catch (error) {
      console.error(
        "Product page payment verification error:",
        error,
      );

      return res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : "Unable to verify the payment right now.",
      });
    }
  },
);

export default router;