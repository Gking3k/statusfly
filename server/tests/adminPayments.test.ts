import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import app from "../src/app.js";
import { parsePaystackRefundStatus } from "../src/services/adminPayments.js";

test("Paystack refund status parser accepts supported lifecycle states only", () => {
  assert.equal(parsePaystackRefundStatus("pending"), "pending");
  assert.equal(parsePaystackRefundStatus("processing"), "processing");
  assert.equal(parsePaystackRefundStatus("needs-attention"), "needs-attention");
  assert.equal(parsePaystackRefundStatus("processed"), "processed");
  assert.equal(parsePaystackRefundStatus("failed"), "failed");
  assert.equal(parsePaystackRefundStatus("unexpected-provider-state"), null);
  assert.equal(parsePaystackRefundStatus(null), null);
});

test("payment and refund administration endpoints require an admin session", async () => {
  const paths = [
    ["get", "/api/admin/payments"],
    ["get", "/api/admin/payments/sfp_test_reference"],
    ["post", "/api/admin/payments/sfp_test_reference/verify"],
    ["post", "/api/admin/payments/sfp_test_reference/refunds"],
    ["post", "/api/admin/refunds/04b1b7b7-d0a3-4db6-8c27-1a7b125f6e4f/refresh"],
  ] as const;

  for (const [method, path] of paths) {
    const response = method === "get"
      ? await request(app).get(path)
      : await request(app).post(path);
    assert.equal(response.status, 401, `${method.toUpperCase()} ${path} must require admin authentication`);
    assert.equal(response.body.error, "Admin authentication required.");
    assert.equal(response.headers["cache-control"], "no-store");
  }
});
