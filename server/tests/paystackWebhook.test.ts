import "dotenv/config";
import { createServer } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import paystackWebhookRouter from "../src/routes/paystackWebhook.js";
import { createHmac, createHash, randomBytes } from "node:crypto";
import { query } from "../src/db.js";
import { STATUSFLY_PRODUCT_PAGE_PRICE_KOBO } from "../src/services/productPagePaymentFlow.js";

const SECRET = "sk_test_statusfly_webhook_secret";

function makeApp() {
  const app = express();

  app.use(
    "/api/payments/webhook",
    express.raw({
      type: "application/json",
      limit: "1mb",
    }),
    paystackWebhookRouter,
  );

  return app;
}

async function sendWebhook(payload: unknown, secret = SECRET) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");

  const signature = createHmac("sha512", secret)
    .update(body)
    .digest("hex");

  const server = createServer(makeApp());

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  assert.ok(address && typeof address === "object");

  try {
    return await fetch(
      `http://127.0.0.1:${address.port}/api/payments/webhook`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-paystack-signature": signature,
        },
        body,
      },
    );
  } finally {
    server.close();
  }
}

test("accepts a valid StatusFly charge.success webhook", async () => {
  process.env.PAYSTACK_SECRET_KEY = SECRET;

  const response = await sendWebhook({
    event: "charge.success",
    data: {
      status: "success",
      reference: "sf-test-reference-123456",
      amount: 100000,
      currency: "NGN",
      metadata: JSON.stringify({
        campaignId: "campaign-123456",
        productName: "Rose Clay",
        product: "statusfly-static-pack",
      }),
    },
  });

  assert.equal(response.status, 200);
});

test("rejects a forged webhook signature", async () => {
  process.env.PAYSTACK_SECRET_KEY = SECRET;

  const response = await sendWebhook(
    {
      event: "charge.success",
      data: {
        status: "success",
        reference: "sf-test-reference-123456",
        amount: 100000,
        currency: "NGN",
        metadata: JSON.stringify({
          campaignId: "campaign-123456",
          productName: "Rose Clay",
          product: "statusfly-static-pack",
        }),
      },
    },
    "wrong-secret",
  );

  assert.equal(response.status, 401);
});

test("acknowledges non-payment events", async () => {
  process.env.PAYSTACK_SECRET_KEY = SECRET;

  const response = await sendWebhook({
    event: "refund.processed",
    data: {},
  });

  assert.equal(response.status, 200);
});

test("acknowledges authenticated but invalid-amount events without treating them as purchases", async () => {
  process.env.PAYSTACK_SECRET_KEY = SECRET;

  const response = await sendWebhook({
    event: "charge.success",
    data: {
      status: "success",
      reference: "sf-test-reference-123456",
      amount: 50000,
      currency: "NGN",
      metadata: JSON.stringify({
        campaignId: "campaign-123456",
        productName: "Rose Clay",
        product: "statusfly-static-pack",
      }),
    },
  });

  assert.equal(response.status, 200);
});

test("accepts a valid product-page charge.success webhook and publishes the page", async () => {
  process.env.PAYSTACK_SECRET_KEY = SECRET;

  const editToken = randomBytes(32).toString("hex");
  const editTokenHash = createHash("sha256")
    .update(editToken, "utf8")
    .digest("hex");

  const publicSlug =
    `webhook-${randomBytes(5).toString("hex")}`;

  const pageResult =
    await query<{ id: string }>(
      `
        INSERT INTO product_pages (
          public_slug,
          edit_token_hash,
          brand_name,
          whatsapp_number,
          delivery_info,
          product_name,
          category,
          description,
          selling_points,
          price_naira,
          availability,
          status
        )
        VALUES (
          $1,
          $2,
          'Webhook Test',
          '2348011111111',
          'Test delivery',
          'Webhook Product',
          'Other',
          'Testing product-page webhook fulfillment.',
          '["Test point"]'::jsonb,
          50000,
          'available',
          'draft'
        )
        RETURNING id
      `,
      [publicSlug, editTokenHash],
    );

  const pageId = pageResult.rows[0]?.id;
  assert.ok(pageId);

  const reference =
    `sfp_webhook_${randomBytes(6).toString("hex")}`;

  await query(
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
        'NGN',
        'pending',
        'buyer@example.com'
      )
    `,
    [pageId, reference, STATUSFLY_PRODUCT_PAGE_PRICE_KOBO],
  );

  try {
    const response = await sendWebhook({
      event: "charge.success",
      data: {
        status: "success",
        reference,
        amount: STATUSFLY_PRODUCT_PAGE_PRICE_KOBO,
        currency: "NGN",
        metadata: JSON.stringify({
          type: "statusfly_product_page",
          productPageId: pageId,
          publicSlug,
        }),
      },
    });

    assert.equal(response.status, 200);

    const payment =
      await query<{
        status: string;
        verified_via: string;
      }>(
        `
          SELECT status, verified_via
          FROM product_page_payments
          WHERE reference = $1
        `,
        [reference],
      );

    const page =
      await query<{ status: string }>(
        `
          SELECT status
          FROM product_pages
          WHERE id = $1
        `,
        [pageId],
      );

    assert.equal(
      payment.rows[0]?.status,
      "success",
    );

    assert.equal(
      payment.rows[0]?.verified_via,
      "webhook",
    );

    assert.equal(
      page.rows[0]?.status,
      "published",
    );
  } finally {
    await query(
      `DELETE FROM product_page_payments WHERE product_page_id = $1`,
      [pageId],
    );

    await query(
      `DELETE FROM product_pages WHERE id = $1`,
      [pageId],
    );
  }
});

test("handles a duplicate product-page charge.success webhook safely", async () => {
  process.env.PAYSTACK_SECRET_KEY = SECRET;

  const editToken = randomBytes(32).toString("hex");
  const editTokenHash = createHash("sha256")
    .update(editToken, "utf8")
    .digest("hex");

  const publicSlug =
    `duplicate-webhook-${randomBytes(5).toString("hex")}`;

  const pageResult = await query<{ id: string }>(
    `
      INSERT INTO product_pages (
        public_slug,
        edit_token_hash,
        brand_name,
        whatsapp_number,
        delivery_info,
        product_name,
        category,
        description,
        selling_points,
        price_naira,
        availability,
        status
      )
      VALUES (
        $1,
        $2,
        'Duplicate Webhook Test',
        '2348011111111',
        'Test delivery',
        'Duplicate Webhook Product',
        'Other',
        'Testing duplicate product-page webhook delivery.',
        '["Test point"]'::jsonb,
        50000,
        'available',
        'draft'
      )
      RETURNING id
    `,
    [publicSlug, editTokenHash],
  );

  const pageId = pageResult.rows[0]?.id;
  assert.ok(pageId);

  const reference =
    `sfp_duplicate_${randomBytes(6).toString("hex")}`;

  await query(
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
        'NGN',
        'pending',
        'buyer@example.com'
      )
    `,
    [pageId, reference, STATUSFLY_PRODUCT_PAGE_PRICE_KOBO],
  );

  const payload = {
    event: "charge.success",
    data: {
      status: "success",
      reference,
      amount: STATUSFLY_PRODUCT_PAGE_PRICE_KOBO,
      currency: "NGN",
      metadata: JSON.stringify({
        type: "statusfly_product_page",
        productPageId: pageId,
        publicSlug,
      }),
    },
  };

  try {
    const firstResponse = await sendWebhook(payload);

    assert.equal(firstResponse.status, 200);

    const firstPayment = await query<{
      status: string;
      verified_via: string;
      verified_at: string | null;
    }>(
      `
        SELECT status, verified_via, verified_at
        FROM product_page_payments
        WHERE reference = $1
      `,
      [reference],
    );

    const firstPage = await query<{
      status: string;
      published_at: string | null;
    }>(
      `
        SELECT status, published_at
        FROM product_pages
        WHERE id = $1
      `,
      [pageId],
    );

    assert.equal(
      firstPayment.rows[0]?.status,
      "success",
    );

    assert.equal(
      firstPayment.rows[0]?.verified_via,
      "webhook",
    );

    assert.ok(
      firstPayment.rows[0]?.verified_at,
    );

    assert.equal(
      firstPage.rows[0]?.status,
      "published",
    );

    assert.ok(
      firstPage.rows[0]?.published_at,
    );

    const verifiedAt =
      firstPayment.rows[0]?.verified_at;

    const publishedAt =
      firstPage.rows[0]?.published_at;

    const secondResponse = await sendWebhook(payload);

    assert.equal(secondResponse.status, 200);

    const secondPayment = await query<{
      status: string;
      verified_via: string;
      verified_at: string | null;
    }>(
      `
        SELECT status, verified_via, verified_at
        FROM product_page_payments
        WHERE reference = $1
      `,
      [reference],
    );

    const secondPage = await query<{
      status: string;
      published_at: string | null;
    }>(
      `
        SELECT status, published_at
        FROM product_pages
        WHERE id = $1
      `,
      [pageId],
    );

    assert.equal(
      secondPayment.rows[0]?.status,
      "success",
    );

    assert.equal(
      secondPayment.rows[0]?.verified_via,
      "webhook",
    );

    assert.equal(
      new Date(secondPayment.rows[0]?.verified_at ?? "").getTime(),
      new Date(verifiedAt ?? "").getTime(),
    );

    assert.equal(
      secondPage.rows[0]?.status,
      "published",
    );

    assert.equal(
      new Date(secondPage.rows[0]?.published_at ?? "").getTime(),
      new Date(publishedAt ?? "").getTime(),
    );

    const paymentCount = await query<{
      count: string;
    }>(
      `
        SELECT COUNT(*)::text AS count
        FROM product_page_payments
        WHERE reference = $1
      `,
      [reference],
    );

    assert.equal(
      paymentCount.rows[0]?.count,
      "1",
    );
  } finally {
    await query(
      `
        DELETE FROM product_page_payments
        WHERE product_page_id = $1
      `,
      [pageId],
    );

    await query(
      `
        DELETE FROM product_pages
        WHERE id = $1
      `,
      [pageId],
    );
  }
});