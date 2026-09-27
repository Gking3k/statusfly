import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_SECRET = process.env.PAYSTACK_SECRET_KEY;

function restoreEnvironment() {
  globalThis.fetch = ORIGINAL_FETCH;

  if (ORIGINAL_SECRET === undefined) {
    delete process.env.PAYSTACK_SECRET_KEY;
  } else {
    process.env.PAYSTACK_SECRET_KEY = ORIGINAL_SECRET;
  }
}

test.afterEach(restoreEnvironment);

test("POST /api/payments/initialize rejects an invalid email", async () => {
  process.env.PAYSTACK_SECRET_KEY = "test-secret";

  const response = await request(app)
    .post("/api/payments/initialize")
    .send({
      email: "not-an-email",
      campaignId: "campaign-123456",
      productName: "Rose Clay Rice Polish",
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
});

test("POST /api/payments/initialize rejects missing campaignId", async () => {
  process.env.PAYSTACK_SECRET_KEY = "test-secret";

  const response = await request(app)
    .post("/api/payments/initialize")
    .send({
      email: "customer@example.com",
      productName: "Rose Clay Rice Polish",
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
});



test("POST /api/payments/initialize rejects an overly long product name", async () => {
  process.env.PAYSTACK_SECRET_KEY = "test-secret";

  const response = await request(app)
    .post("/api/payments/initialize")
    .send({
      email: "customer@example.com",
      campaignId: "campaign-123456",
      productName: "x".repeat(49),
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
});

test("POST /api/payments/initialize returns a Paystack access code", async () => {
  process.env.PAYSTACK_SECRET_KEY = "test-secret";

  let receivedBody: Record<string, unknown> | null = null;

  globalThis.fetch = async (_input, init) => {
    receivedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

    return new Response(
      JSON.stringify({
        status: true,
        message: "Authorization URL created",
        data: {
          access_code: "access-test-123",
          reference: "sf-test-reference-123",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const response = await request(app)
    .post("/api/payments/initialize")
    .send({
      email: "customer@example.com",
      campaignId: "campaign-123456",
      productName: "Rose Clay Rice Polish",
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.accessCode, "access-test-123");
  assert.equal(response.body.reference, "sf-test-reference-123");

  assert.ok(receivedBody);
  const paymentBody = receivedBody as Record<string, unknown>;
  assert.equal(paymentBody.amount, "100000");
  assert.equal(paymentBody.currency, "NGN");

  const metadata = JSON.parse(String(paymentBody.metadata)) as Record<
    string,
    unknown
  >;

  assert.equal(metadata.campaignId, "campaign-123456");
});

test("GET /api/payments/verify rejects an invalid reference", async () => {
  process.env.PAYSTACK_SECRET_KEY = "test-secret";

  const response = await request(app).get(
    "/api/payments/verify/bad_reference?campaignId=campaign-123456",
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
});

test("GET /api/payments/verify confirms a matching successful payment", async () => {
  process.env.PAYSTACK_SECRET_KEY = "test-secret";

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: true,
        message: "Verification successful",
        data: {
          status: "success",
          reference: "sf-test-reference-123",
          amount: 100000,
          currency: "NGN",
          metadata: JSON.stringify({
            campaignId: "campaign-123456",
          }),
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  const response = await request(app).get(
    "/api/payments/verify/sf-test-reference-123?campaignId=campaign-123456",
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.verified, true);
  assert.equal(response.body.status, "success");
});



test("GET /api/payments/verify rejects a Paystack response with a mismatched reference", async () => {
  process.env.PAYSTACK_SECRET_KEY = "test-secret";

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: true,
        message: "Verification successful",
        data: {
          status: "success",
          reference: "sf-a-different-reference",
          amount: 100000,
          currency: "NGN",
          metadata: JSON.stringify({
            campaignId: "campaign-123456",
          }),
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  const response = await request(app).get(
    "/api/payments/verify/sf-test-reference-123?campaignId=campaign-123456",
  );

  assert.equal(response.status, 409);
  assert.equal(response.body.verified, false);
});

test("GET /api/payments/verify rejects a successful payment with the wrong amount", async () => {
  process.env.PAYSTACK_SECRET_KEY = "test-secret";

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: true,
        message: "Verification successful",
        data: {
          status: "success",
          reference: "sf-test-reference-123",
          amount: 90000,
          currency: "NGN",
          metadata: JSON.stringify({
            campaignId: "campaign-123456",
          }),
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  const response = await request(app).get(
    "/api/payments/verify/sf-test-reference-123?campaignId=campaign-123456",
  );

  assert.equal(response.status, 409);
  assert.equal(response.body.verified, false);
});
