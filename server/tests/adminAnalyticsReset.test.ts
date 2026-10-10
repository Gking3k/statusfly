import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAdminAnalyticsResetPayload,
  PLATFORM_ANALYTICS_RESET_METRICS,
  PRODUCT_PAGE_ANALYTICS_RESET_METRICS,
} from "../src/services/adminAnalyticsResets.js";

const pageId = "f05be4b2-f1ac-4dd7-bbea-fefb96b2f22d";

test("platform analytics reset accepts only supported metrics and a reason", () => {
  const parsed = parseAdminAnalyticsResetPayload({
    scopeType: "platform",
    metricKeys: ["home_views", "whatsapp_clicks"],
    reason: "Starting a clean reporting baseline",
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.scopeId, null);
    assert.deepEqual(parsed.value.metricKeys, ["home_views", "whatsapp_clicks"]);
  }
});

test("page analytics reset requires a valid page ID and only page metrics", () => {
  const parsed = parseAdminAnalyticsResetPayload({
    scopeType: "product_page",
    scopeId: pageId,
    metricKeys: ["product_page_views", "share_clicks"],
    reason: "Reset after page launch testing",
  });
  assert.equal(parsed.ok, true);
  const invalidMetric = parseAdminAnalyticsResetPayload({
    scopeType: "product_page",
    scopeId: pageId,
    metricKeys: ["home_views"],
    reason: "Reset after page launch testing",
  });
  assert.equal(invalidMetric.ok, false);
});

test("analytics reset validation rejects empty, duplicate, and financial metrics", () => {
  assert.equal(parseAdminAnalyticsResetPayload({ scopeType: "platform", metricKeys: [], reason: "okay" }).ok, false);
  assert.equal(parseAdminAnalyticsResetPayload({ scopeType: "platform", metricKeys: ["home_views", "home_views"], reason: "okay" }).ok, false);
  assert.equal(parseAdminAnalyticsResetPayload({ scopeType: "platform", metricKeys: ["total_revenue"], reason: "okay" }).ok, false);
  assert.equal(parseAdminAnalyticsResetPayload({ scopeType: "platform", scopeId: pageId, metricKeys: ["home_views"], reason: "okay" }).ok, false);
  assert.equal(parseAdminAnalyticsResetPayload({ scopeType: "product_page", scopeId: "not-a-uuid", metricKeys: ["product_page_views"], reason: "okay" }).ok, false);
  assert.equal(parseAdminAnalyticsResetPayload({ scopeType: "platform", metricKeys: ["home_views"], reason: "  " }).ok, false);
});

test("reset metric options align with the foundation table's supported values", () => {
  assert.deepEqual([...PLATFORM_ANALYTICS_RESET_METRICS], [
    "unique_visitors", "home_views", "create_views", "drafts_created",
    "payment_starts", "payment_init_failures", "public_product_page_views",
    "product_page_views", "whatsapp_clicks", "share_clicks",
  ]);
  assert.deepEqual([...PRODUCT_PAGE_ANALYTICS_RESET_METRICS], [
    "product_page_views", "whatsapp_clicks", "share_clicks",
  ]);
});
