import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";

test("POST /api/feedback accepts valid feedback", async () => {
  const response = await request(app)
    .post("/api/feedback")
    .send({
      rating: 5,
      reuseIntent: "definitely",
      improvement: "Animated statuses",
      comment: "The pack looked great.",
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
});

test("POST /api/feedback rejects an invalid rating", async () => {
  const response = await request(app)
    .post("/api/feedback")
    .send({ rating: 6, reuseIntent: "definitely" });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
});

test("POST /api/feedback rejects an invalid improvement", async () => {
  const response = await request(app)
    .post("/api/feedback")
    .send({ rating: 5, reuseIntent: "maybe", improvement: "Something random" });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
});

test("POST /api/feedback rejects an oversized comment", async () => {
  const response = await request(app)
    .post("/api/feedback")
    .send({ rating: 4, reuseIntent: "maybe", comment: "x".repeat(1001) });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
});
