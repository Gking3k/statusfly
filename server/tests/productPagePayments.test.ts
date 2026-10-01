import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import test from "node:test";
import productPagePaymentsRouter from "../src/routes/productPagePayments.js";
import { query } from "../src/db.js";
import { STATUSFLY_PRODUCT_PAGE_PRICE_KOBO } from "../src/services/productPagePaymentFlow.js";

const PAYSTACK_SECRET = "sk_test_statusfly_phase6";
const ORIGINAL_FETCH = globalThis.fetch;

function makeApp() {
  const app = express();
  app.use(express.json({ limit: "64kb", strict: true }));
  app.use("/api/product-pages", productPagePaymentsRouter);
  return app;
}

async function withServer<T>(callback: (baseUrl: string) => Promise<T>) {
  const server = createServer(makeApp());

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function createDraftPage() {
  const editToken = randomBytes(32).toString("hex");
  const editTokenHash = createHash("sha256")
    .update(editToken, "utf8")
    .digest("hex");
  const slug = `phase6-${randomBytes(5).toString("hex")}`;

  const result = await query<{ id: string; public_slug: string }>(
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
        'Phase 6 Test',
        '2348011111111',
        'Test delivery',
        'Phase 6 Product',
        'Other',
        'Temporary page for Phase 6 payment tests.',
        '["Test point"]'::jsonb,
        50000,
        'available',
        'draft'
      )
      RETURNING id, public_slug
    `,
    [slug, editTokenHash],
  );

  const row = result.rows[0];
  assert.ok(row);

  return { id: row.id, slug: row.public_slug, editToken };
}

async function cleanupPage(id: string) {
  await query(`DELETE FROM product_page_payments WHERE product_page_id = $1`, [id]);
  await query(`DELETE FROM product_pages WHERE id = $1`, [id]);
}

function mockPaystackFetch(handler: (url: string, init: RequestInit) => Response) {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.startsWith("https://api.paystack.co/")) {
      return handler(url, init ?? {});
    }

    return ORIGINAL_FETCH(input, init);
  };
}

function restoreFetch() {
  globalThis.fetch = ORIGINAL_FETCH;
}

test("initializes a ₦3,000 NGN product-page payment with product metadata", async () => {
  process.env.PAYSTACK_SECRET_KEY = PAYSTACK_SECRET;
  process.env.CLIENT_URL = "http://localhost:5173";

  const page = await createDraftPage();
  let initializeBody: Record<string, unknown> | null = null;

  mockPaystackFetch((url, init) => {
    assert.equal(url, "https://api.paystack.co/transaction/initialize");
    initializeBody = JSON.parse(String(init.body)) as Record<string, unknown>;

    return new Response(
      JSON.stringify({
        status: true,
        message: "Authorization URL created",
        data: {
          authorization_url: "https://checkout.paystack.com/test-phase6",
          reference: initializeBody.reference,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await ORIGINAL_FETCH(
        `${baseUrl}/api/product-pages/edit/${page.editToken}/payment/initialize`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:5173",
          },
          body: JSON.stringify({ email: "buyer@example.com" }),
        },
      );

      const body = (await response.json()) as Record<string, unknown>;

      assert.equal(response.status, 200);
      assert.equal(body.currency, "NGN");
      assert.equal(body.amountKobo, STATUSFLY_PRODUCT_PAGE_PRICE_KOBO);
      assert.equal(typeof body.reference, "string");
      assert.equal(
        body.authorizationUrl,
        "https://checkout.paystack.com/test-phase6",
      );

      assert.ok(initializeBody);
      assert.equal(initializeBody?.email, "buyer@example.com");
      assert.equal(initializeBody?.amount, STATUSFLY_PRODUCT_PAGE_PRICE_KOBO);
      assert.equal(initializeBody?.currency, "NGN");
      assert.equal(initializeBody?.reference, body.reference);
      assert.equal(initializeBody?.callback_url, "http://localhost:5173/payment/success");

      const metadata = initializeBody?.metadata as Record<string, unknown>;
      assert.equal(metadata.type, "statusfly_product_page");
      assert.equal(metadata.productPageId, page.id);
      assert.equal(metadata.publicSlug, page.slug);

      const payment = await query<{
        amount_kobo: number;
        currency: string;
        status: string;
        customer_email: string;
      }>(
        `
          SELECT amount_kobo, currency, status, customer_email
          FROM product_page_payments
          WHERE product_page_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [page.id],
      );

      assert.equal(payment.rows[0]?.amount_kobo, STATUSFLY_PRODUCT_PAGE_PRICE_KOBO);
      assert.equal(payment.rows[0]?.currency, "NGN");
      assert.equal(payment.rows[0]?.status, "pending");
      assert.equal(payment.rows[0]?.customer_email, "buyer@example.com");
    });
  } finally {
    restoreFetch();
    await cleanupPage(page.id);
  }
});

test("rejects payment initialization with an invalid email", async () => {
  const page = await createDraftPage();

  try {
    await withServer(async (baseUrl) => {
      const response = await ORIGINAL_FETCH(
        `${baseUrl}/api/product-pages/edit/${page.editToken}/payment/initialize`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "not-an-email" }),
        },
      );

      assert.equal(response.status, 400);
    });
  } finally {
    await cleanupPage(page.id);
  }
});

test("verifies the exact transaction, publishes the product page, and is idempotent", async () => {
  process.env.PAYSTACK_SECRET_KEY = PAYSTACK_SECRET;

  const page = await createDraftPage();
  const reference = `sfp_test_${randomBytes(6).toString("hex")}`;

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
      VALUES ($1, $2, $3, 'NGN', 'pending', 'buyer@example.com')
    `,
    [page.id, reference, STATUSFLY_PRODUCT_PAGE_PRICE_KOBO],
  );

  let verifyCalls = 0;
  mockPaystackFetch((url) => {
    assert.equal(
      url,
      `https://api.paystack.co/transaction/verify/${reference}`,
    );
    verifyCalls += 1;

    return new Response(
      JSON.stringify({
        status: true,
        data: {
          reference,
          status: "success",
          amount: STATUSFLY_PRODUCT_PAGE_PRICE_KOBO,
          currency: "NGN",
          metadata: {
            type: "statusfly_product_page",
            productPageId: page.id,
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  try {
    await withServer(async (baseUrl) => {
      const first = await ORIGINAL_FETCH(
        `${baseUrl}/api/product-pages/payment/verify/${reference}`,
      );
      const firstBody = (await first.json()) as Record<string, unknown>;

      assert.equal(first.status, 200);
      assert.equal(firstBody.success, true);
      assert.equal(firstBody.alreadyVerified, false);
      assert.equal(firstBody.publicSlug, page.slug);

      const storedAfterFirst = await query<{
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

      const pageAfterFirst = await query<{ status: string }>(
        `SELECT status FROM product_pages WHERE id = $1`,
        [page.id],
      );

      assert.equal(storedAfterFirst.rows[0]?.status, "success");
      assert.equal(storedAfterFirst.rows[0]?.verified_via, "browser");
      assert.equal(pageAfterFirst.rows[0]?.status, "published");

      const second = await ORIGINAL_FETCH(
        `${baseUrl}/api/product-pages/payment/verify/${reference}`,
      );
      const secondBody = (await second.json()) as Record<string, unknown>;

      assert.equal(second.status, 200);
      assert.equal(secondBody.success, true);
      assert.equal(secondBody.alreadyVerified, true);
      assert.equal(verifyCalls, 1);
    });
  } finally {
    restoreFetch();
    await cleanupPage(page.id);
  }
});

test("rejects a successful Paystack transaction with the wrong amount", async () => {
  process.env.PAYSTACK_SECRET_KEY = PAYSTACK_SECRET;

  const page = await createDraftPage();
  const reference = `sfp_test_bad_${randomBytes(6).toString("hex")}`;

  await query(
    `
      INSERT INTO product_page_payments (
        product_page_id,
        reference,
        amount_kobo,
        currency,
        status
      )
      VALUES ($1, $2, $3, 'NGN', 'pending')
    `,
    [page.id, reference, STATUSFLY_PRODUCT_PAGE_PRICE_KOBO],
  );

  mockPaystackFetch(() =>
    new Response(
      JSON.stringify({
        status: true,
        data: {
          reference,
          status: "success",
          amount: 50000,
          currency: "NGN",
          metadata: {
            type: "statusfly_product_page",
            productPageId: page.id,
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );

  try {
    await withServer(async (baseUrl) => {
      const response = await ORIGINAL_FETCH(
        `${baseUrl}/api/product-pages/payment/verify/${reference}`,
      );

      assert.equal(response.status, 402);

      const payment = await query<{ status: string }>(
        `SELECT status FROM product_page_payments WHERE reference = $1`,
        [reference],
      );
      const pageState = await query<{ status: string }>(
        `SELECT status FROM product_pages WHERE id = $1`,
        [page.id],
      );

      assert.equal(payment.rows[0]?.status, "invalid");
      assert.equal(pageState.rows[0]?.status, "draft");
    });
  } finally {
    restoreFetch();
    await cleanupPage(page.id);
  }
});

test("rejects a successful Paystack transaction with the wrong payment metadata type", async () => {
  process.env.PAYSTACK_SECRET_KEY = PAYSTACK_SECRET;

  const page = await createDraftPage();
  const reference = `sfp_test_type_${randomBytes(6).toString("hex")}`;

  await query(
    `
      INSERT INTO product_page_payments (
        product_page_id,
        reference,
        amount_kobo,
        currency,
        status
      )
      VALUES ($1, $2, $3, 'NGN', 'pending')
    `,
    [page.id, reference, STATUSFLY_PRODUCT_PAGE_PRICE_KOBO],
  );

  mockPaystackFetch(() =>
    new Response(
      JSON.stringify({
        status: true,
        data: {
          reference,
          status: "success",
          amount: STATUSFLY_PRODUCT_PAGE_PRICE_KOBO,
          currency: "NGN",
          metadata: {
            type: "wrong_payment_type",
            productPageId: page.id,
          },
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    ),
  );

  try {
    await withServer(async (baseUrl) => {
      const response = await ORIGINAL_FETCH(
        `${baseUrl}/api/product-pages/payment/verify/${reference}`,
      );

      assert.equal(response.status, 402);

      const payment = await query<{ status: string }>(
        `
          SELECT status
          FROM product_page_payments
          WHERE reference = $1
        `,
        [reference],
      );

      const pageState = await query<{ status: string }>(
        `
          SELECT status
          FROM product_pages
          WHERE id = $1
        `,
        [page.id],
      );

      assert.equal(payment.rows[0]?.status, "invalid");
      assert.equal(pageState.rows[0]?.status, "draft");
    });
  } finally {
    restoreFetch();
    await cleanupPage(page.id);
  }
});