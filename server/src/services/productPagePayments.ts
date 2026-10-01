import { query } from "../db.js";

const STATUSFLY_PRICE_KOBO = 100_000;
const PAYMENT_CURRENCY = "NGN";

export type ProductPagePaymentStatus =
  | "pending"
  | "success"
  | "failed"
  | "invalid";

export type PaymentVerificationSource = "browser" | "webhook";

export interface ProductPagePayment {
  id: string;
  product_page_id: string;
  reference: string;
  amount_kobo: number;
  currency: string;
  status: ProductPagePaymentStatus;
  customer_email: string | null;
  created_at: string;
  verified_at: string | null;
  verified_via: PaymentVerificationSource | null;
}

export interface CreatePaymentAttemptInput {
  productPageId: string;
  reference: string;
  customerEmail?: string | null;
}

export async function createPaymentAttempt(
  input: CreatePaymentAttemptInput,
): Promise<ProductPagePayment> {
  const result = await query<ProductPagePayment>(
    `
      INSERT INTO product_page_payments (
        product_page_id,
        reference,
        amount_kobo,
        currency,
        status,
        customer_email
      )
      VALUES ($1, $2, $3, $4, 'pending', $5)
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
      input.productPageId,
      input.reference,
      STATUSFLY_PRICE_KOBO,
      PAYMENT_CURRENCY,
      input.customerEmail ?? null,
    ],
  );

  const payment = result.rows[0];

  if (!payment) {
    throw new Error("Payment attempt could not be created.");
  }

  return payment;
}

export async function getPaymentByReference(
  reference: string,
): Promise<ProductPagePayment | null> {
  const result = await query<ProductPagePayment>(
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

  return result.rows[0] ?? null;
}

export async function markPaymentSuccessful(
  reference: string,
  verifiedVia: PaymentVerificationSource,
): Promise<ProductPagePayment | null> {
  const result = await query<ProductPagePayment>(
    `
      UPDATE product_page_payments
      SET
        status = 'success',
        verified_at = COALESCE(verified_at, NOW()),
        verified_via = COALESCE(verified_via, $2)
      WHERE reference = $1
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
    [reference, verifiedVia],
  );

  return result.rows[0] ?? null;
}

export async function markPaymentInvalid(
  reference: string,
): Promise<ProductPagePayment | null> {
  const result = await query<ProductPagePayment>(
    `
      UPDATE product_page_payments
      SET status = 'invalid'
      WHERE reference = $1
        AND status <> 'success'
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
    [reference],
  );

  return result.rows[0] ?? null;
}