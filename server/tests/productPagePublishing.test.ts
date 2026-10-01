import "dotenv/config";

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import request from "supertest";

import app from "../src/app.js";
import {
  createPaymentAttempt,
  markPaymentSuccessful,
} from "../src/services/productPagePayments.js";
import { addProductPageImage } from "../src/services/productPageImages.js";

test("a successfully paid product page can be published and retrieved publicly", async () => {
  const createResponse = await request(app)
    .post("/api/product-pages")
    .send({
      brandName: "Published Test Store",
      whatsappNumber: "+2348012345678",
      deliveryInfo: "Nationwide delivery available.",
      productName: "Published Test Product",
      category: "Fashion",
      description: "A fully published test product page.",
      sellingPoints: [
        "Premium quality",
        "Fast delivery",
      ],
      priceNaira: 25000,
      originalPriceNaira: 30000,
      promotionText: "Limited offer",
      availability: "available",
    });

  assert.equal(createResponse.status, 201);

  const {
    id: productPageId,
    publicSlug,
    editToken,
  } = createResponse.body.productPage;

  await addProductPageImage(
    productPageId,
    "products/test/published-1.jpg",
    "https://example.com/published-1.jpg",
    1,
  );

  const reference = `sf-publish-${randomBytes(8).toString("hex")}`;

  await createPaymentAttempt({
    productPageId,
    reference,
    customerEmail: "publish-test@example.com",
  });

  const payment = await markPaymentSuccessful(
    reference,
    "webhook",
  );

  assert.ok(payment);
  assert.equal(payment.status, "success");

  const publishResponse = await request(app)
    .post(`/api/product-pages/edit/${editToken}/publish`);

  assert.equal(publishResponse.status, 200);
  assert.equal(
    publishResponse.body.productPage.status,
    "published",
  );
  assert.ok(publishResponse.body.productPage.published_at);

  const publicResponse = await request(app).get(
    `/api/product-pages/${publicSlug}`,
  );

  assert.equal(publicResponse.status, 200);

  assert.equal(
    publicResponse.body.productPage.product_name,
    "Published Test Product",
  );

  assert.equal(
    publicResponse.body.productPage.status,
    "published",
  );

  assert.equal(
    publicResponse.body.productPage.images.length,
    1,
  );

  assert.equal(
    publicResponse.body.productPage.images[0].position,
    1,
  );

  assert.equal(
    publicResponse.body.productPage.images[0].public_url,
    "https://example.com/published-1.jpg",
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      publicResponse.body.productPage,
      "edit_token_hash",
    ),
    false,
  );
});