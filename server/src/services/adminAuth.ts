import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const SESSION_TTL_SECONDS = 12 * 60 * 60;

type AdminSessionPayload = {
  v: 1;
  username: string;
  iat: number;
  exp: number;
};

function getRequiredEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function hashForCompare(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function secureStringEqual(left: string, right: string) {
  const leftHash = hashForCompare(left);
  const rightHash = hashForCompare(right);
  return timingSafeEqual(leftHash, rightHash);
}

function getAdminConfig() {
  const username = getRequiredEnv("STATUSFLY_ADMIN_USERNAME");
  const password = getRequiredEnv("STATUSFLY_ADMIN_PASSWORD");
  const sessionSecret = getRequiredEnv("STATUSFLY_ADMIN_SESSION_SECRET");

  return { username, password, sessionSecret };
}

export function isAdminConfigured() {
  const config = getAdminConfig();
  return Boolean(
    config.username &&
      config.password &&
      config.sessionSecret &&
      config.sessionSecret.length >= 32,
  );
}

export function validateAdminCredentials(
  username: string,
  password: string,
) {
  const config = getAdminConfig();

  if (!config.username || !config.password) {
    return false;
  }

  return (
    secureStringEqual(username, config.username) &&
    secureStringEqual(password, config.password)
  );
}

export function createAdminSessionToken(username: string) {
  const config = getAdminConfig();

  if (!config.sessionSecret || config.sessionSecret.length < 32) {
    throw new Error(
      "STATUSFLY_ADMIN_SESSION_SECRET must be configured with at least 32 characters.",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    v: 1,
    username,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };

  const encodedPayload = Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64url");

  const signature = createHmac(
    "sha256",
    config.sessionSecret,
  )
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

export function verifyAdminSessionToken(token: string) {
  const config = getAdminConfig();

  if (
    !config.username ||
    !config.sessionSecret ||
    config.sessionSecret.length < 32
  ) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = createHmac(
    "sha256",
    config.sessionSecret,
  )
    .update(encodedPayload)
    .digest("base64url");

  if (!secureStringEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<AdminSessionPayload>;

    if (
      payload.v !== 1 ||
      payload.username !== config.username ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);

    if (
      payload.exp <= now ||
      payload.iat > now + 60 ||
      payload.exp - payload.iat > SESSION_TTL_SECONDS
    ) {
      return null;
    }

    return {
      username: payload.username,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

export function getBearerToken(authorizationHeader: unknown) {
  if (typeof authorizationHeader !== "string") {
    return null;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
