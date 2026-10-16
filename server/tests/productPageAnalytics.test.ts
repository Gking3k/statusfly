import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import request from "supertest";
import app from "../src/app.js";
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
      itemWhatsappClicks: [],
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


test("collection WhatsApp clicks are attributed to the matching item", async () => {
  const productPageId = await createTestProductPage();
  let itemId = "";

  try {
    await query(
      `UPDATE product_pages SET page_type = 'collection', collection_title = 'Test Collection' WHERE id = $1`,
      [productPageId],
    );
    const itemResult = await query<{ id: string }>(
      `INSERT INTO public.product_page_items (
        product_page_id, position, product_name, category, description,
        selling_points, price_naira, availability, options
      ) VALUES ($1, 1, 'Blue Shirt', 'Fashion', 'Test item', '[]'::jsonb, 2500, 'available', '[]'::jsonb)
      RETURNING id`,
      [productPageId],
    );
    itemId = itemResult.rows[0]?.id ?? "";
    assert.ok(itemId);

    await recordProductPageEvent(productPageId, "whatsapp_click", itemId);
    await recordProductPageEvent(productPageId, "whatsapp_click", itemId);

    const analytics = await getProductPageAnalytics(productPageId);
    assert.equal(analytics.whatsappClicks, 2);
    assert.deepEqual(analytics.itemWhatsappClicks, [
      { productPageItemId: itemId, productName: "Blue Shirt", clicks: 2 },
    ]);
  } finally {
    await deleteTestProductPage(productPageId);
  }
});

test("item analytics require a valid item id and WhatsApp click event", async () => {
  await assert.rejects(
    () => recordProductPageEvent("test-page", "whatsapp_click", "not-a-uuid"),
    { message: "Invalid collection item ID." },
  );
  await assert.rejects(
    () => recordProductPageEvent("test-page", "page_view", "f35a51aa-16cb-4a72-9062-000324e9dc90"),
    { message: "An item can only be attached to a WhatsApp click." },
  );
});


test("public collection analytics accepts only an item belonging to that collection", async () => {
  const productPageId = await createTestProductPage();
  const otherPageId = await createTestProductPage();
  try {
    await query(
      `UPDATE product_pages SET page_type = 'collection', collection_title = 'Test Collection' WHERE id = $1`,
      [productPageId],
    );
    await query(
      `UPDATE product_pages SET page_type = 'collection', collection_title = 'Other Collection' WHERE id = $1`,
      [otherPageId],
    );
    const pageResult = await query<{ public_slug: string }>(
      `SELECT public_slug FROM product_pages WHERE id = $1`,
      [productPageId],
    );
    const slug = pageResult.rows[0]?.public_slug;
    assert.ok(slug);

    const ownItemResult = await query<{ id: string }>(
      `INSERT INTO public.product_page_items (
        product_page_id, position, product_name, category, description,
        selling_points, price_naira, availability, options
      ) VALUES ($1, 1, 'Blue Shirt', 'Fashion', 'Test item', '[]'::jsonb, 2500, 'available', '[]'::jsonb)
      RETURNING id`,
      [productPageId],
    );
    const ownItemId = ownItemResult.rows[0]?.id;
    assert.ok(ownItemId);

    const otherItemResult = await query<{ id: string }>(
      `INSERT INTO public.product_page_items (
        product_page_id, position, product_name, category, description,
        selling_points, price_naira, availability, options
      ) VALUES ($1, 1, 'Red Shoes', 'Fashion', 'Foreign test item', '[]'::jsonb, 7500, 'available', '[]'::jsonb)
      RETURNING id`,
      [otherPageId],
    );
    const otherItemId = otherItemResult.rows[0]?.id;
    assert.ok(otherItemId);

    const accepted = await request(app)
      .post(`/api/product-pages/${slug}/events`)
      .send({ eventType: "whatsapp_click", itemId: ownItemId });
    assert.equal(accepted.status, 202);

    const invalidId = await request(app)
      .post(`/api/product-pages/${slug}/events`)
      .send({ eventType: "whatsapp_click", itemId: "not-a-uuid" });
    assert.equal(invalidId.status, 400);

    const wrongEvent = await request(app)
      .post(`/api/product-pages/${slug}/events`)
      .send({ eventType: "page_view", itemId: ownItemId });
    assert.equal(wrongEvent.status, 400);

    const foreignItem = await request(app)
      .post(`/api/product-pages/${slug}/events`)
      .send({ eventType: "whatsapp_click", itemId: otherItemId });
    assert.equal(foreignItem.status, 400);
  } finally {
    await deleteTestProductPage(productPageId);
    await deleteTestProductPage(otherPageId);
  }
});
