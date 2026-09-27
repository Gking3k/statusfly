import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import paystackWebhookRouter from "../src/routes/paystackWebhook.js";

const SECRET = "sk_test_statusfly_webhook_secret";

function makeApp() {
  const app = express();

  app.use(
    "/api/payments/webhook",
    express.raw({
      type: "application/json",
      limit: "1mb",
    }),
    paystackWebhookRouter,
  );

  return app;
}

async function sendWebhook(payload: unknown, secret = SECRET) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");

  const signature = createHmac("sha512", secret)
    .update(body)
    .digest("hex");

  const server = createServer(makeApp());

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  assert.ok(address && typeof address === "object");

  try {
    return await fetch(
      `http://127.0.0.1:${address.port}/api/payments/webhook`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-paystack-signature": signature,
        },
        body,
      },
    );
  } finally {
    server.close();
  }
}

test("accepts a valid StatusFly charge.success webhook", async () => {
  process.env.PAYSTACK_SECRET_KEY = SECRET;

  const response = await sendWebhook({
    event: "charge.success",
    data: {
      status: "success",
      reference: "sf-test-reference-123456",
      amount: 100000,
      currency: "NGN",
      metadata: JSON.stringify({
        campaignId: "campaign-123456",
        productName: "Rose Clay",
        product: "statusfly-static-pack",
      }),
    },
  });

  assert.equal(response.status, 200);
});

test("rejects a forged webhook signature", async () => {
  process.env.PAYSTACK_SECRET_KEY = SECRET;

  const response = await sendWebhook(
    {
      event: "charge.success",
      data: {
        status: "success",
        reference: "sf-test-reference-123456",
        amount: 100000,
        currency: "NGN",
        metadata: JSON.stringify({
          campaignId: "campaign-123456",
          productName: "Rose Clay",
          product: "statusfly-static-pack",
        }),
      },
    },
    "wrong-secret",
  );

  assert.equal(response.status, 401);
});

test("acknowledges non-payment events", async () => {
  process.env.PAYSTACK_SECRET_KEY = SECRET;

  const response = await sendWebhook({
    event: "refund.processed",
    data: {},
  });

  assert.equal(response.status, 200);
});

test("acknowledges authenticated but invalid-amount events without treating them as purchases", async () => {
  process.env.PAYSTACK_SECRET_KEY = SECRET;

  const response = await sendWebhook({
    event: "charge.success",
    data: {
      status: "success",
      reference: "sf-test-reference-123456",
      amount: 50000,
      currency: "NGN",
      metadata: JSON.stringify({
        campaignId: "campaign-123456",
        productName: "Rose Clay",
        product: "statusfly-static-pack",
      }),
    },
  });

  assert.equal(response.status, 200);
});
