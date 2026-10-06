import test from "node:test";
import assert from "node:assert/strict";

import {
  isValidPlatformAnalyticsEventType,
  isValidVisitorId,
} from "../src/services/platformAnalytics.js";

test("platform analytics validates supported event types and visitor IDs", () => {
  assert.equal(isValidPlatformAnalyticsEventType("home_view"), true);
  assert.equal(
    isValidPlatformAnalyticsEventType("public_product_page_view"),
    true,
  );
  assert.equal(isValidPlatformAnalyticsEventType("unknown_event"), false);

  assert.equal(
    isValidVisitorId("550e8400-e29b-41d4-a716-446655440000"),
    true,
  );
  assert.equal(isValidVisitorId("not-a-visitor-id"), false);
});
