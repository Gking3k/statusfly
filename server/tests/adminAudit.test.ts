import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeAuditDetails } from "../src/services/adminAudit.js";

test("admin audit details omit sensitive keys and bound logged values", () => {
  const result = sanitizeAuditDetails({
    channel: "owner_dashboard",
    count: 3,
    password: "must-not-be-kept",
    edit_token: "must-not-be-kept",
    customer_email: "seller@example.com",
    whatsapp_number: "+2348000000000",
    description: "x".repeat(600),
    "bad key": "ignored",
    notFinite: Number.POSITIVE_INFINITY,
  });

  assert.deepEqual(result, {
    channel: "owner_dashboard",
    count: 3,
    description: "x".repeat(500),
  });
});
