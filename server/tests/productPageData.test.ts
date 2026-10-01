import "dotenv/config";

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { createProductPage } from "../src/services/productPages.js";
import {
  createPaymentAttempt,
  getPaymentByReference,
  markPaymentInvalid,
  markPaymentSuccessful,
} from "../src/services/productPagePayments.js";
import {
  getProductPageAnalytics,
  recordProductPageEvent,
} from "../src/services/productPageAnalytics.js";
import {
  createProductPageFeedback,
  listProductPageFeedback,
} from "../src/services/productPageFeedback.js";

async function createTestProductPage() {
  return createProductPage({
    brandName: "Data Test Store",
    whatsappNumber: "+2348012345678",
    deliveryInfo: "Lagos delivery.",
    productName: `Test Product ${randomBytes(4).toString("hex")}`,
    category: "Fashion",
    description: "Data service integration test.",
    sellingPoints: ["Quality"],
    priceNaira: 25000,
    availability: "available",
  });
}

test("payment attempts can be created, retrieved, and verified", async () => {
  const productPage = await createTestProductPage();

  const reference = `sf-test-${randomBytes(8).toString("hex")}`;

  const payment = await createPaymentAttempt({
    productPageId: productPage.id,
    reference,
    customerEmail: "test@example.com",
  });

  assert.equal(payment.product_page_id, productPage.id);
  assert.equal(payment.reference, reference);
  assert.equal(payment.amount_kobo, 100000);
  assert.equal(payment.currency, "NGN");
  assert.equal(payment.status, "pending");

  const retrieved = await getPaymentByReference(reference);

  assert.ok(retrieved);
  assert.equal(retrieved.reference, reference);

  const verified = await markPaymentSuccessful(reference, "browser");

  assert.ok(verified);
  assert.equal(verified.status, "success");
  assert.equal(verified.verified_via, "browser");
  assert.ok(verified.verified_at);
});

test("invalid payment attempts can be marked invalid", async () => {
  const productPage = await createTestProductPage();

  const reference = `sf-invalid-${randomBytes(8).toString("hex")}`;

  await createPaymentAttempt({
    productPageId: productPage.id,
    reference,
  });

  const invalid = await markPaymentInvalid(reference);

  assert.ok(invalid);
  assert.equal(invalid.status, "invalid");
});

test("product page analytics events can be recorded and summarized", async () => {
  const productPage = await createTestProductPage();

  await recordProductPageEvent(productPage.id, "page_view");
  await recordProductPageEvent(productPage.id, "page_view");
  await recordProductPageEvent(productPage.id, "whatsapp_click");
  await recordProductPageEvent(productPage.id, "share_click");

  const summary = await getProductPageAnalytics(productPage.id);

  assert.equal(summary.pageViews, 2);
  assert.equal(summary.whatsappClicks, 1);
  assert.equal(summary.shareClicks, 1);
});

test("product page feedback can be stored and retrieved", async () => {
  const productPage = await createTestProductPage();

  const feedback = await createProductPageFeedback({
    productPageId: productPage.id,
    rating: 5,
    outcome: "customer",
    featureRequest: "More layout options",
    improvementText: "Make product pages easier to share.",
  });

  assert.ok(feedback.id);
  assert.equal(feedback.product_page_id, productPage.id);
  assert.equal(feedback.rating, 5);
  assert.equal(feedback.outcome, "customer");

  const feedbackList = await listProductPageFeedback(productPage.id);

  assert.equal(feedbackList.length, 1);
  assert.equal(feedbackList[0]?.rating, 5);
});

test("general feedback can exist without a product page", async () => {
  const feedback = await createProductPageFeedback({
    rating: 4,
    outcome: "not_yet",
    improvementText: "The builder was useful.",
  });

  assert.ok(feedback.id);
  assert.equal(feedback.product_page_id, null);
  assert.equal(feedback.rating, 4);
});