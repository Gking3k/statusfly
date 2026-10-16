import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import test from "node:test";

import productPageEditLinkRecoveryRouter from "../src/routes/productPageEditLinkRecovery.js";
import {
  decryptProductPageEditToken,
  encryptProductPageEditToken,
} from "../src/services/productPagePaymentFlow.js";
import { sendProductPageEditLinkRecoveryEmail } from "../src/services/email.js";

const ORIGINAL_FETCH = globalThis.fetch;

async function withServer<T>(callback: (baseUrl: string) => Promise<T>) {
  const app = express();
  app.use(express.json({ limit: "64kb", strict: true }));
  app.use("/api/product-pages", productPageEditLinkRecoveryRouter);
  const server = createServer(app);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("edit token recovery encryption can round-trip a valid token", () => {
  const originalKey = process.env.STATUSFLY_EDIT_TOKEN_ENCRYPTION_KEY;
  process.env.STATUSFLY_EDIT_TOKEN_ENCRYPTION_KEY = "ab".repeat(32);
  const token = "cd".repeat(32);

  try {
    const encrypted = encryptProductPageEditToken(token);
    assert.ok(encrypted);
    assert.notEqual(encrypted, token);
    assert.equal(decryptProductPageEditToken(encrypted), token);
    assert.equal(decryptProductPageEditToken(`${encrypted}tampered`), null);
  } finally {
    if (originalKey === undefined) {
      delete process.env.STATUSFLY_EDIT_TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.STATUSFLY_EDIT_TOKEN_ENCRYPTION_KEY = originalKey;
    }
  }
});

test("recovery email contains the private link and warns the recipient to keep it secret", async () => {
  const previous = {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.PRODUCT_PAGE_FROM_EMAIL,
  };
  process.env.RESEND_API_KEY = "re_test_statusfly";
  process.env.PRODUCT_PAGE_FROM_EMAIL = "StatusFly Test <pages@example.com>";

  const outgoing: Array<{ to: string[]; subject: string; html: string }> = [];
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.method, "POST");
    outgoing.push(JSON.parse(String(init?.body)) as { to: string[]; subject: string; html: string });
    return new Response(null, { status: 200 });
  };

  try {
    const sent = await sendProductPageEditLinkRecoveryEmail({
      email: "buyer@example.com",
      pages: [{
        brandName: "Test Shop",
        productName: "Test Bag",
        publicUrl: "https://statusfly.app/p/test-slug",
        editUrl: `https://statusfly.app/edit/${"ab".repeat(32)}`,
      }],
    });

    assert.equal(sent, true);
    assert.equal(outgoing.length, 1);
    assert.deepEqual(outgoing[0]?.to, ["buyer@example.com"]);
    assert.match(outgoing[0]?.subject ?? "", /editing link/i);
    assert.match(outgoing[0]?.html ?? "", /Test Shop/);
    assert.match(outgoing[0]?.html ?? "", /Keep these links private/);
    assert.match(outgoing[0]?.html ?? "", /https:\/\/statusfly\.app\/edit\//);
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
    if (previous.apiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous.apiKey;
    if (previous.from === undefined) delete process.env.PRODUCT_PAGE_FROM_EMAIL;
    else process.env.PRODUCT_PAGE_FROM_EMAIL = previous.from;
  }
});

test("edit-link recovery rejects invalid email addresses without querying page records", async () => {
  await withServer(async (baseUrl) => {
    const response = await ORIGINAL_FETCH(`${baseUrl}/api/product-pages/recover-edit-link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });

    assert.equal(response.status, 400);
    const body = await response.json() as { error?: string };
    assert.match(body.error ?? "", /valid email/i);
    assert.equal(response.headers.get("cache-control"), "no-store, private, max-age=0");
  });
});
