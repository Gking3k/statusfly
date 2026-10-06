import test from "node:test";
import assert from "node:assert/strict";

import {
  createAdminSessionToken,
  validateAdminCredentials,
  verifyAdminSessionToken,
} from "../src/services/adminAuth.js";

const ORIGINAL_ENV = {
  username: process.env.STATUSFLY_ADMIN_USERNAME,
  password: process.env.STATUSFLY_ADMIN_PASSWORD,
  secret: process.env.STATUSFLY_ADMIN_SESSION_SECRET,
};

function configureAdmin() {
  process.env.STATUSFLY_ADMIN_USERNAME = "statusfly-owner";
  process.env.STATUSFLY_ADMIN_PASSWORD =
    "test-admin-password-1234567890";
  process.env.STATUSFLY_ADMIN_SESSION_SECRET =
    "test-admin-session-secret-that-is-at-least-32-chars";
}

function restoreAdminEnv() {
  if (ORIGINAL_ENV.username === undefined) {
    delete process.env.STATUSFLY_ADMIN_USERNAME;
  } else {
    process.env.STATUSFLY_ADMIN_USERNAME = ORIGINAL_ENV.username;
  }

  if (ORIGINAL_ENV.password === undefined) {
    delete process.env.STATUSFLY_ADMIN_PASSWORD;
  } else {
    process.env.STATUSFLY_ADMIN_PASSWORD = ORIGINAL_ENV.password;
  }

  if (ORIGINAL_ENV.secret === undefined) {
    delete process.env.STATUSFLY_ADMIN_SESSION_SECRET;
  } else {
    process.env.STATUSFLY_ADMIN_SESSION_SECRET = ORIGINAL_ENV.secret;
  }
}

test("admin credentials validate and signed sessions verify", () => {
  configureAdmin();

  try {
    assert.equal(
      validateAdminCredentials(
        "statusfly-owner",
        "test-admin-password-1234567890",
      ),
      true,
    );

    assert.equal(
      validateAdminCredentials(
        "statusfly-owner",
        "wrong-password",
      ),
      false,
    );

    const token = createAdminSessionToken("statusfly-owner");
    const session = verifyAdminSessionToken(token);

    assert.ok(session);
    assert.equal(session.username, "statusfly-owner");
    assert.ok(session.expiresAt);
  } finally {
    restoreAdminEnv();
  }
});

test("tampered admin sessions are rejected", () => {
  configureAdmin();

  try {
    const token = createAdminSessionToken("statusfly-owner");
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    assert.equal(verifyAdminSessionToken(tampered), null);
  } finally {
    restoreAdminEnv();
  }
});
