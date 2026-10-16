import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";

test("private seller-edit API responses are never cacheable", async () => {
  // Invalid token is rejected before touching the database, so this regression
  // test does not require a configured PostgreSQL instance.
  const response = await request(app).get("/api/product-pages/edit/not-a-token");

  assert.equal(response.status, 400);
  assert.match(response.headers["cache-control"] ?? "", /no-store/i);
  assert.match(response.headers.pragma ?? "", /no-cache/i);
});

test("malformed JSON gets a bounded JSON error response", async () => {
  const response = await request(app)
    .post("/api/platform-analytics/events")
    .set("Content-Type", "application/json")
    .send('{"eventType":');

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "Invalid JSON request body.");
  assert.match(response.headers["cache-control"] ?? "", /no-store/i);
  assert.equal(JSON.stringify(response.body).includes("SyntaxError"), false);
});

test("unsupported image upload types receive a JSON 400 instead of Express default error HTML", async () => {
  const editToken = "a".repeat(64);
  const response = await request(app)
    .post(`/api/product-pages/edit/${editToken}/images`)
    .attach("images", Buffer.from("not an image"), {
      filename: "notes.txt",
      contentType: "text/plain",
    });

  assert.equal(response.status, 400);
  assert.match(response.headers["content-type"] ?? "", /application\/json/i);
  assert.equal(response.body.error, "Only JPG, PNG or WebP images are supported.");
  assert.match(response.headers["cache-control"] ?? "", /no-store/i);
});
