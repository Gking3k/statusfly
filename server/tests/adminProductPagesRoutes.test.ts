import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";

const exampleId = "f58f565e-073f-4f7c-97df-e6815d6dc90f";

test("all product-page management endpoints require an admin session", async () => {
  const requests = [
    request(app).get("/api/admin/product-pages"),
    request(app).get(`/api/admin/product-pages/${exampleId}`),
    request(app).patch(`/api/admin/product-pages/${exampleId}/status`).send({ status: "hidden" }),
    request(app).post(`/api/admin/product-pages/${exampleId}/archive`).send({ reason: "test" }),
    request(app).post(`/api/admin/product-pages/${exampleId}/restore`).send({ reason: "test" }),
    request(app).delete(`/api/admin/product-pages/${exampleId}`).send({ reason: "test" }),
  ];

  const responses = await Promise.all(requests);
  for (const response of responses) {
    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Admin authentication required.");
    assert.equal(response.headers["cache-control"], "no-store");
  }
});
