import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { query } from "../db.js";

import {
  sendProductPageAccessEmail,
} from "./email.js";

export const STATUSFLY_PRODUCT_PAGE_PRICE_KOBO =
  300_000;

export const STATUSFLY_PRODUCT_PAGE_CURRENCY =
  "NGN" as const;

export const STATUSFLY_PRODUCT_PAGE_PAYMENT_TYPE =
  "statusfly_product_page" as const;

export type ProductPagePaymentStatus =
  | "pending"
  | "success"
  | "failed"
  | "invalid";

export interface ProductPagePaymentRecord {
  id: string;
  productPageId: string;
  reference: string;
  amountKobo: number;
  currency: string;
  status: ProductPagePaymentStatus;
  customerEmail: string | null;
  createdAt: string;
  verifiedAt: string | null;
  verifiedVia:
    | "browser"
    | "webhook"
    | "admin"
    | null;
}

export interface FulfilledProductPagePayment {
  payment: ProductPagePaymentRecord;
  publicSlug: string;
  alreadyFulfilled: boolean;
  emailSent: boolean;
}

const EDIT_TOKEN_ENCRYPTION_ENV =
  "STATUSFLY_EDIT_TOKEN_ENCRYPTION_KEY";

function getEditTokenEncryptionKey():
  | Buffer
  | null {
  const value =
    process.env[
      EDIT_TOKEN_ENCRYPTION_ENV
    ]?.trim() ?? "";

  if (!/^[a-f0-9]{64}$/i.test(value)) {
    return null;
  }

  return Buffer.from(value, "hex");
}

export function encryptProductPageEditToken(
  token: string,
): string | null {
  const key =
    getEditTokenEncryptionKey();

  if (
    !key ||
    !/^[a-f0-9]{64}$/.test(token)
  ) {
    return null;
  }

  const iv = randomBytes(12);

  const cipher = createCipheriv(
    "aes-256-gcm",
    key,
    iv,
  );

  const ciphertext =
    Buffer.concat([
      cipher.update(token, "utf8"),
      cipher.final(),
    ]);

  const authTag =
    cipher.getAuthTag();

  return [
    "v1",
    iv.toString("hex"),
    authTag.toString("hex"),
    ciphertext.toString("hex"),
  ].join(".");
}

export function decryptProductPageEditToken(
  value: string,
): string | null {
  const key =
    getEditTokenEncryptionKey();

  if (!key) {
    return null;
  }

  const parts = value.split(".");

  if (
    parts.length !== 4 ||
    parts[0] !== "v1"
  ) {
    return null;
  }

  const [
    ,
    ivHex,
    authTagHex,
    ciphertextHex,
  ] = parts;

  if (
    !ivHex ||
    !authTagHex ||
    !ciphertextHex ||
    !/^[a-f0-9]+$/i.test(ivHex) ||
    !/^[a-f0-9]+$/i.test(authTagHex) ||
    !/^[a-f0-9]+$/i.test(ciphertextHex)
  ) {
    return null;
  }

  try {
    const decipher =
      createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(ivHex, "hex"),
      );

    decipher.setAuthTag(
      Buffer.from(
        authTagHex,
        "hex",
      ),
    );

    const token =
      Buffer.concat([
        decipher.update(
          Buffer.from(
            ciphertextHex,
            "hex",
          ),
        ),
        decipher.final(),
      ]).toString("utf8");

    return /^[a-f0-9]{64}$/.test(
      token,
    )
      ? token
      : null;
  } catch {
    return null;
  }
}

export async function storeProductPagePaymentEditToken(
  reference: string,
  editToken: string,
): Promise<boolean> {
  const encryptedToken =
    encryptProductPageEditToken(
      editToken,
    );

  if (!encryptedToken) {
    console.warn(
      `StatusFly email access token storage skipped for ${reference}: encryption key is not configured.`,
    );

    return false;
  }

  try {
    const result =
      await query(
        `
          UPDATE product_page_payments
          SET edit_token_encrypted = $1
          WHERE reference = $2
        `,
        [
          encryptedToken,
          reference,
        ],
      );

    return result.rowCount === 1;
  } catch (error) {
    console.warn(
      `StatusFly email access token storage skipped for ${reference}:`,
      error,
    );

    return false;
  }
}

export async function getStoredProductPageEditToken(
  reference: string,
): Promise<string | null> {
  try {
    const result =
      await query<{
        edit_token_encrypted:
          | string
          | null;
      }>(
        `
          SELECT edit_token_encrypted
          FROM product_page_payments
          WHERE reference = $1
          LIMIT 1
        `,
        [reference],
      );

    const encryptedToken =
      result.rows[0]
        ?.edit_token_encrypted;

    return encryptedToken
      ? decryptProductPageEditToken(
          encryptedToken,
        )
      : null;
  } catch (error) {
    console.warn(
      `StatusFly stored edit token lookup skipped for ${reference}:`,
      error,
    );

    return null;
  }
}

export function isValidPaymentEmail(
  value: string,
) {
  return (
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      value,
    )
  );
}

export function createProductPagePaymentReference() {
  const timestamp =
    Date.now().toString(36);

  const random =
    randomBytes(8).toString("hex");

  return `sfp_${timestamp}_${random}`;
}

function mapPaymentRow(row: {
  id: string;
  product_page_id: string;
  reference: string;
  amount_kobo: number;
  currency: string;
  status: ProductPagePaymentStatus;
  customer_email: string | null;
  created_at: string;
  verified_at: string | null;
  verified_via:
    | "browser"
    | "webhook"
    | "admin"
    | null;
}): ProductPagePaymentRecord {
  return {
    id: row.id,
    productPageId:
      row.product_page_id,
    reference:
      row.reference,
    amountKobo:
      Number(row.amount_kobo),
    currency:
      row.currency,
    status:
      row.status,
    customerEmail:
      row.customer_email,
    createdAt:
      row.created_at,
    verifiedAt:
      row.verified_at,
    verifiedVia:
      row.verified_via,
  };
}

export async function getProductPagePaymentByReference(
  reference: string,
): Promise<ProductPagePaymentRecord | null> {
  const result =
    await query<{
      id: string;
      product_page_id: string;
      reference: string;
      amount_kobo: number;
      currency: string;
      status: ProductPagePaymentStatus;
      customer_email: string | null;
      created_at: string;
      verified_at: string | null;
      verified_via:
        | "browser"
        | "webhook"
        | "admin"
        | null;
    }>(
      `
        SELECT
          id,
          product_page_id,
          reference,
          amount_kobo,
          currency,
          status,
          customer_email,
          created_at,
          verified_at,
          verified_via
        FROM product_page_payments
        WHERE reference = $1
        LIMIT 1
      `,
      [reference],
    );

  const row =
    result.rows[0];

  return row
    ? mapPaymentRow(row)
    : null;
}

export async function createPendingProductPagePayment(
  productPageId: string,
  reference: string,
  customerEmail: string,
): Promise<ProductPagePaymentRecord> {
  const result =
    await query<{
      id: string;
      product_page_id: string;
      reference: string;
      amount_kobo: number;
      currency: string;
      status: ProductPagePaymentStatus;
      customer_email: string | null;
      created_at: string;
      verified_at: string | null;
      verified_via:
        | "browser"
        | "webhook"
        | "admin"
        | null;
    }>(
      `
        INSERT INTO product_page_payments (
          product_page_id,
          reference,
          amount_kobo,
          currency,
          status,
          customer_email
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          'pending',
          $5
        )
        RETURNING
          id,
          product_page_id,
          reference,
          amount_kobo,
          currency,
          status,
          customer_email,
          created_at,
          verified_at,
          verified_via
      `,
      [
        productPageId,
        reference,
        STATUSFLY_PRODUCT_PAGE_PRICE_KOBO,
        STATUSFLY_PRODUCT_PAGE_CURRENCY,
        customerEmail,
      ],
    );

  const row =
    result.rows[0];

  if (!row) {
    throw new Error(
      "Payment attempt could not be created.",
    );
  }

  return mapPaymentRow(row);
}

export async function markProductPagePaymentSuccessful(
  reference: string,
  verifiedVia:
    | "browser"
    | "webhook"
    | "admin",
  expectedAmountKobo = STATUSFLY_PRODUCT_PAGE_PRICE_KOBO,
): Promise<ProductPagePaymentRecord | null> {
  const result =
    await query<{
      id: string;
      product_page_id: string;
      reference: string;
      amount_kobo: number;
      currency: string;
      status: ProductPagePaymentStatus;
      customer_email: string | null;
      created_at: string;
      verified_at: string | null;
      verified_via:
        | "browser"
        | "webhook"
        | "admin"
        | null;
    }>(
      `
        UPDATE product_page_payments
        SET
          status = 'success',
          verified_at = COALESCE(
            verified_at,
            NOW()
          ),
          verified_via = COALESCE(
            verified_via,
            $2
          )
        WHERE reference = $1
          AND amount_kobo = $3
          AND currency = $4
          AND status <> 'invalid'
        RETURNING
          id,
          product_page_id,
          reference,
          amount_kobo,
          currency,
          status,
          customer_email,
          created_at,
          verified_at,
          verified_via
      `,
      [
        reference,
        verifiedVia,
        expectedAmountKobo,
        STATUSFLY_PRODUCT_PAGE_CURRENCY,
      ],
    );

  const row =
    result.rows[0];

  return row
    ? mapPaymentRow(row)
    : null;
}

export async function markProductPagePaymentFailed(
  reference: string,
): Promise<void> {
  await query(
    `
      UPDATE product_page_payments
      SET status = 'failed'
      WHERE reference = $1
        AND status = 'pending'
    `,
    [reference],
  );
}

export async function markProductPagePaymentInvalid(
  reference: string,
): Promise<void> {
  await query(
    `
      UPDATE product_page_payments
      SET status = 'invalid'
      WHERE reference = $1
        AND status <> 'success'
    `,
    [reference],
  );
}

export async function publishProductPageById(
  productPageId: string,
): Promise<{
  publicSlug: string;
} | null> {
  const result =
    await query<{
      public_slug: string;
    }>(
      `
        UPDATE product_pages
        SET
          status = 'published',
          published_at = COALESCE(published_at, NOW())
        WHERE id = $1
          AND status = 'draft'
          AND archived_at IS NULL
        RETURNING public_slug
      `,
      [productPageId],
    );

  const row =
    result.rows[0];

  return row
    ? {
        publicSlug:
          row.public_slug,
      }
    : null;
}

export async function fulfillSuccessfulProductPagePayment(
  reference: string,
  verifiedVia:
    | "browser"
    | "webhook"
    | "admin",
  expectedAmountKobo = STATUSFLY_PRODUCT_PAGE_PRICE_KOBO,
): Promise<FulfilledProductPagePayment | null> {
  const existing =
    await getProductPagePaymentByReference(
      reference,
    );

  if (!existing) {
    return null;
  }

  if (
    existing.amountKobo !== expectedAmountKobo ||
    !Number.isSafeInteger(expectedAmountKobo) ||
    expectedAmountKobo <= 0 ||
    existing.currency.toUpperCase() !== STATUSFLY_PRODUCT_PAGE_CURRENCY
  ) {
    return null;
  }

  const pageResult =
    await query<{
      id: string;
      public_slug: string;
      brand_name: string;
      product_name: string;
      status: string;
      archived_at: string | null;
    }>(
      `
        SELECT
          id,
          public_slug,
          brand_name,
          product_name,
          status,
          archived_at::text AS archived_at
        FROM product_pages
        WHERE id = $1
        LIMIT 1
      `,
      [existing.productPageId],
    );

  const page =
    pageResult.rows[0];

  if (!page) {
    return null;
  }

  const alreadyFulfilled =
    existing.status === "success";

  if (!alreadyFulfilled) {
    const marked =
      await markProductPagePaymentSuccessful(
        reference,
        verifiedVia,
        expectedAmountKobo,
      );

    if (!marked) {
      return null;
    }
  }

  // A later verification/webhook must not undo an owner's unpublish or
  // archive decision. Only newly fulfilled, unarchived draft pages are
  // automatically published.
  if (!alreadyFulfilled && page.status === "draft" && !page.archived_at) {
    await publishProductPageById(existing.productPageId);
  }

  const fulfilledPayment =
    (await getProductPagePaymentByReference(
      reference,
    )) ?? existing;

  let emailSent = false;

  const editToken =
    await getStoredProductPageEditToken(
      reference,
    );

  if (
    fulfilledPayment.customerEmail &&
    editToken &&
    typeof page.brand_name ===
      "string" &&
    typeof page.product_name ===
      "string"
  ) {
    const clientOrigin =
      process.env.CLIENT_URL?.trim() ||
      "http://localhost:5173";

    emailSent =
      await sendProductPageAccessEmail({
        email:
          fulfilledPayment.customerEmail,
        brandName:
          page.brand_name,
        productName:
          page.product_name,
        publicUrl:
          `${clientOrigin}/p/${page.public_slug}`,
        editUrl:
          `${clientOrigin}/edit/${editToken}`,
        paymentReference:
          reference,
      });
  }

  return {
    payment:
      fulfilledPayment,
    publicSlug:
      page.public_slug,
    alreadyFulfilled,
    emailSent,
  };
}