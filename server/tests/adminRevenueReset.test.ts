import assert from "node:assert/strict";
import test from "node:test";
import { parseAdminRevenueResetPayload } from "../src/services/adminRevenueResets.js";

test("net revenue reporting reset accepts explicit confirmation and a reason", () => {
  const parsed = parseAdminRevenueResetPayload({
    confirmed: true,
    reason: "Start a new reporting period",
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.confirmed, true);
    assert.equal(parsed.value.reason, "Start a new reporting period");
  }
});

test("net revenue reporting reset rejects absent confirmation and invalid reasons", () => {
  assert.equal(parseAdminRevenueResetPayload({ reason: "Start a new reporting period" }).ok, false);
  assert.equal(parseAdminRevenueResetPayload({ confirmed: false, reason: "Start a new reporting period" }).ok, false);
  assert.equal(parseAdminRevenueResetPayload({ confirmed: true, reason: "  " }).ok, false);
  assert.equal(parseAdminRevenueResetPayload({ confirmed: true, reason: "ok" }).ok, false);
  assert.equal(parseAdminRevenueResetPayload({ confirmed: true, reason: "x".repeat(1001) }).ok, false);
  assert.equal(parseAdminRevenueResetPayload([]).ok, false);
});
