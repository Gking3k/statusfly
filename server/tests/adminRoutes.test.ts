import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";

test("admin session, analytics, and audit routes reject unauthenticated requests", async () => {
  const paths = [
    "/api/admin/session",
    "/api/admin/analytics",
    "/api/admin/audit-log",
    "/api/admin/future-sensitive-route",
  ];

  for (const path of paths) {
    const response = await request(app).get(path);
    assert.equal(response.status, 401, `${path} should require admin authentication`);
    assert.equal(response.body.error, "Admin authentication required.");
    assert.equal(response.headers["cache-control"], "no-store");
  }
});


test("analytics reset endpoint rejects unauthenticated requests", async () => {
  const response = await request(app)
    .post("/api/admin/analytics/reset")
    .send({ scopeType: "platform", metricKeys: ["home_views"], reason: "test reset" });
  assert.equal(response.status, 401);
  assert.equal(response.body.error, "Admin authentication required.");
  assert.equal(response.headers["cache-control"], "no-store");
});


test("net revenue reporting reset endpoint rejects unauthenticated requests", async () => {
  const response = await request(app)
    .post("/api/admin/analytics/revenue-reset")
    .send({ confirmed: true, reason: "test reset" });
  assert.equal(response.status, 401);
  assert.equal(response.body.error, "Admin authentication required.");
  assert.equal(response.headers["cache-control"], "no-store");
});
