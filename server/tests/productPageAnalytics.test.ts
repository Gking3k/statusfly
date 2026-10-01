import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { query } from "../src/db.js";
import {
  getProductPageAnalytics,
  recordProductPageEvent,
} from "../src/services/productPageAnalytics.js";

async function createTestProductPage() {
  const idResult = await query<{ id: string }>(
    `
      INSERT INTO product_pages (
        id,
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
        status,
        published_at
      )
      VALUES (
        gen_random_uuid(),
        $1,
        $2,
        'StatusFly Analytics Test',
        '2348000000000',
        'Test delivery',
        'Analytics Test Product',
        'Other',
        'Temporary product page used by analytics tests.',
        '[]'::jsonb,
        1000,
        'available',
        'published',
        NOW()
      )
      RETURNING id
    `,
    [
      `analytics-test-${Date.now()}-${randomBytes(4).toString("hex")}`,
      randomBytes(32).toString("hex"),
    ],
  );

  const row = idResult.rows[0];

  if (!row) {
    throw new Error("Unable to create analytics test product page.");
  }

  return row.id;
}

async function deleteTestProductPage(productPageId: string) {
  await query(
    `DELETE FROM product_pages WHERE id = $1`,
    [productPageId],
  );
}

test("product page analytics records supported events", async () => {
  const productPageId = await createTestProductPage();

  try {
    await recordProductPageEvent(productPageId, "page_view");
    await recordProductPageEvent(productPageId, "page_view");
    await recordProductPageEvent(productPageId, "whatsapp_click");
    await recordProductPageEvent(productPageId, "share_click");

    const analytics = await getProductPageAnalytics(productPageId);

    assert.deepEqual(analytics, {
      pageViews: 2,
      whatsappClicks: 1,
      shareClicks: 1,
    });
  } finally {
    await deleteTestProductPage(productPageId);
  }
});

test("product page analytics rejects unsupported events", async () => {
  await assert.rejects(
    () =>
      recordProductPageEvent(
        "page-id",
        "not-real" as never,
      ),
    {
      message: "Invalid product page analytics event.",
    },
  );
});

test("product page analytics requires a product page id", async () => {
  await assert.rejects(
    () => recordProductPageEvent("", "page_view"),
    {
      message: "Product page ID is required.",
    },
  );

  await assert.rejects(
    () => getProductPageAnalytics(""),
    {
      message: "Product page ID is required.",
    },
  );
});
