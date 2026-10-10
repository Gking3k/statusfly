import rateLimit from "express-rate-limit";
import { Router, type Request, type Response } from "express";
import {
  createAdminSessionToken,
  getBearerToken,
  isAdminConfigured,
  validateAdminCredentials,
  verifyAdminSessionToken,
} from "../services/adminAuth.js";
import {
  getAdminAnalytics,
  type AdminAnalyticsRange,
} from "../services/adminAnalytics.js";
import {
  getRecentAdminAuditEvents,
  recordAdminAuditEvent,
} from "../services/adminAudit.js";
import {
  AdminProductPageError,
  archiveAdminProductPage,
  changeAdminProductPageStatus,
  getAdminProductPageDetail,
  listAdminProductPages,
  permanentlyDeleteAdminProductPage,
  restoreAdminProductPage,
  type AdminProductPageActionStatus,
  type AdminProductPageStatusFilter,
} from "../services/adminProductPages.js";
import {
  AdminAnalyticsResetError,
  createAdminAnalyticsReset,
  parseAdminAnalyticsResetPayload,
} from "../services/adminAnalyticsResets.js";
import {
  createAdminRevenueReset,
  parseAdminRevenueResetPayload,
} from "../services/adminRevenueResets.js";
import {
  AdminPaymentError,
  getAdminPaymentDetail,
  getAdminRefundById,
  initiateAdminPaymentRefund,
  listAdminPayments,
  refreshAdminRefundFromPaystack,
  verifyAdminPaymentWithPaystack,
  type AdminPaymentStatusFilter,
} from "../services/adminPayments.js";

const router = Router();

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  return next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const refundActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const analyticsResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const revenueResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

function getAuthenticatedAdmin(req: Request) {
  const token = getBearerToken(req.headers.authorization);

  if (!token) {
    return null;
  }

  return verifyAdminSessionToken(token);
}

/*
 * Keep login public, then fail closed for every other /api/admin route.
 * Future admin endpoints inherit this guard unless deliberately mounted before it.
 */
router.post("/login", loginLimiter, async (req, res) => {
  if (!isAdminConfigured()) {
    return res.status(503).json({
      error:
        "Admin access is not configured. Set the StatusFly admin environment variables first.",
    });
  }

  const username = req.body?.username;
  const password = req.body?.password;

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username.trim() ||
    !password
  ) {
    return res.status(400).json({
      error: "Enter your admin username and password.",
    });
  }

  if (!validateAdminCredentials(username.trim(), password)) {
    return res.status(401).json({
      error: "Invalid admin credentials.",
    });
  }

  const adminUsername = username.trim();
  const token = createAdminSessionToken(adminUsername);

  // Login must remain available if the database audit table has not yet been
  // migrated. The migration is supplied with this phase; audit failures are
  // surfaced in server logs but do not expose credentials or block sign-in.
  try {
    await recordAdminAuditEvent({
      actorUsername: adminUsername,
      action: "admin.login.succeeded",
      entityType: "admin",
      entityId: adminUsername,
      details: { channel: "owner_dashboard" },
    });
  } catch (error) {
    // Audit-table migration failure must not lock the owner out of the dashboard.
    console.error("Unable to write admin login audit event:", error);
  }

  res.set("Cache-Control", "no-store");

  return res.status(200).json({
    success: true,
    token,
    expiresInSeconds: 12 * 60 * 60,
  });
});

router.use((req, res, next) => {
  const admin = getAuthenticatedAdmin(req);

  if (!admin) {
    res.set("Cache-Control", "no-store");
    return res.status(401).json({
      error: "Admin authentication required.",
    });
  }

  res.locals.admin = admin;
  return next();
});


const PRODUCT_PAGE_STATUSES: AdminProductPageStatusFilter[] = [
  "all",
  "draft",
  "published",
  "hidden",
  "archived",
];
const ADMIN_PRODUCT_PAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getAdminUsername(res: Response): string | null {
  const admin = res.locals.admin as { username?: unknown } | undefined;
  return typeof admin?.username === "string" && admin.username.trim()
    ? admin.username.trim()
    : null;
}

function readAdminReason(req: Request): { reason: string | null; error: string | null } {
  const value = req.body?.reason;
  if (value === undefined || value === null || value === "") {
    return { reason: null, error: null };
  }
  if (typeof value !== "string") {
    return { reason: null, error: "Reason must be text." };
  }
  if (value.trim().length > 1000) {
    return { reason: null, error: "Reason must be 1,000 characters or fewer." };
  }
  return { reason: value.trim() || null, error: null };
}

function handleAdminProductPageError(error: unknown, res: Response, fallback: string) {
  if (error instanceof AdminProductPageError) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

router.get("/session", (_req, res) => {
  const admin = res.locals.admin as ReturnType<typeof verifyAdminSessionToken>;

  if (!admin) {
    return res.status(401).json({ error: "Admin authentication required." });
  }

  res.set("Cache-Control", "no-store");

  return res.status(200).json({
    authenticated: true,
    username: admin.username,
    expiresAt: admin.expiresAt,
  });
});

router.get("/analytics", async (req, res) => {
  const rawRange = req.query.range;
  const range: AdminAnalyticsRange =
    rawRange === "7d" || rawRange === "all"
      ? rawRange
      : "30d";

  try {
    const analytics = await getAdminAnalytics(range);

    res.set("Cache-Control", "no-store");

    return res.status(200).json({
      analytics,
    });
  } catch (error) {
    console.error("Admin analytics error:", error);

    return res.status(500).json({
      error: "Unable to load StatusFly analytics.",
    });
  }
});

router.post("/analytics/reset", analyticsResetLimiter, async (req, res) => {
  const parsed = parseAdminAnalyticsResetPayload(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }

  const actorUsername = getAdminUsername(res);
  if (!actorUsername) {
    return res.status(401).json({ error: "Admin authentication required." });
  }

  try {
    const result = await createAdminAnalyticsReset(parsed.value, actorUsername);
    res.set("Cache-Control", "no-store");
    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof AdminAnalyticsResetError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    console.error("Admin analytics reset failed:", error);
    return res.status(500).json({ error: "Unable to reset selected analytics. No successful reset was recorded." });
  }
});

router.post("/analytics/revenue-reset", revenueResetLimiter, async (req, res) => {
  const parsed = parseAdminRevenueResetPayload(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }

  const actorUsername = getAdminUsername(res);
  if (!actorUsername) {
    return res.status(401).json({ error: "Admin authentication required." });
  }

  try {
    const result = await createAdminRevenueReset(parsed.value.reason, actorUsername);
    res.set("Cache-Control", "no-store");
    return res.status(201).json(result);
  } catch (error) {
    console.error("Admin net revenue reporting reset failed:", error);
    return res.status(500).json({ error: "Unable to reset net revenue reporting. No successful reset was recorded." });
  }
});

router.get("/audit-log", async (req, res) => {
  const rawLimit = req.query.limit;
  const parsedLimit = typeof rawLimit === "string" ? Number(rawLimit) : 20;
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : 20;

  try {
    const events = await getRecentAdminAuditEvents(limit);
    res.set("Cache-Control", "no-store");

    return res.status(200).json({ events });
  } catch (error) {
    console.error("Admin audit log error:", error);

    return res.status(503).json({
      error:
        "Admin audit log is unavailable. Apply the StatusFly admin foundation database migration and try again.",
    });
  }
});


router.get("/product-pages", async (req, res) => {
  const rawStatus = typeof req.query.status === "string" ? req.query.status : "all";
  if (!PRODUCT_PAGE_STATUSES.includes(rawStatus as AdminProductPageStatusFilter)) {
    return res.status(400).json({ error: "Invalid product-page status filter." });
  }

  const rawPage = typeof req.query.page === "string" ? Number(req.query.page) : 1;
  const rawPageSize = typeof req.query.pageSize === "string" ? Number(req.query.pageSize) : 20;
  const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1_000_000) : 1;
  const pageSize = Number.isInteger(rawPageSize) ? Math.max(1, Math.min(50, rawPageSize)) : 20;
  const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";

  try {
    const result = await listAdminProductPages({
      search,
      status: rawStatus as AdminProductPageStatusFilter,
      page,
      pageSize,
    });
    return res.status(200).json(result);
  } catch (error) {
    return handleAdminProductPageError(error, res, "Unable to load product pages.");
  }
});

router.get("/product-pages/:id", async (req, res) => {
  const id = req.params.id;
  if (typeof id !== "string" || !ADMIN_PRODUCT_PAGE_ID.test(id)) {
    return res.status(400).json({ error: "Invalid product-page ID." });
  }

  try {
    const result = await getAdminProductPageDetail(id);
    if (!result) return res.status(404).json({ error: "Product page not found." });
    return res.status(200).json(result);
  } catch (error) {
    return handleAdminProductPageError(error, res, "Unable to load product-page details.");
  }
});

router.patch("/product-pages/:id/status", async (req, res) => {
  const id = req.params.id;
  if (typeof id !== "string" || !ADMIN_PRODUCT_PAGE_ID.test(id)) {
    return res.status(400).json({ error: "Invalid product-page ID." });
  }
  const status = req.body?.status;
  if (status !== "published" && status !== "hidden") {
    return res.status(400).json({ error: "Status must be either published or hidden." });
  }
  const adminUsername = getAdminUsername(res);
  if (!adminUsername) return res.status(401).json({ error: "Admin authentication required." });
  const { reason, error: reasonError } = readAdminReason(req);
  if (reasonError) return res.status(400).json({ error: reasonError });

  try {
    const result = await changeAdminProductPageStatus(
      id,
      status as AdminProductPageActionStatus,
      adminUsername,
      reason,
    );
    return res.status(200).json({ productPage: result });
  } catch (error) {
    return handleAdminProductPageError(error, res, "Unable to change product-page status.");
  }
});

router.post("/product-pages/:id/archive", async (req, res) => {
  const id = req.params.id;
  if (typeof id !== "string" || !ADMIN_PRODUCT_PAGE_ID.test(id)) {
    return res.status(400).json({ error: "Invalid product-page ID." });
  }
  const adminUsername = getAdminUsername(res);
  if (!adminUsername) return res.status(401).json({ error: "Admin authentication required." });
  const { reason, error: reasonError } = readAdminReason(req);
  if (reasonError) return res.status(400).json({ error: reasonError });

  try {
    const result = await archiveAdminProductPage(id, adminUsername, reason);
    return res.status(200).json({ productPage: result });
  } catch (error) {
    return handleAdminProductPageError(error, res, "Unable to archive product page.");
  }
});

router.post("/product-pages/:id/restore", async (req, res) => {
  const id = req.params.id;
  if (typeof id !== "string" || !ADMIN_PRODUCT_PAGE_ID.test(id)) {
    return res.status(400).json({ error: "Invalid product-page ID." });
  }
  const adminUsername = getAdminUsername(res);
  if (!adminUsername) return res.status(401).json({ error: "Admin authentication required." });
  const { reason, error: reasonError } = readAdminReason(req);
  if (reasonError) return res.status(400).json({ error: reasonError });

  try {
    const result = await restoreAdminProductPage(id, adminUsername, reason);
    return res.status(200).json({ productPage: result });
  } catch (error) {
    return handleAdminProductPageError(error, res, "Unable to restore product page.");
  }
});

router.delete("/product-pages/:id", async (req, res) => {
  const id = req.params.id;
  if (typeof id !== "string" || !ADMIN_PRODUCT_PAGE_ID.test(id)) {
    return res.status(400).json({ error: "Invalid product-page ID." });
  }
  const adminUsername = getAdminUsername(res);
  if (!adminUsername) return res.status(401).json({ error: "Admin authentication required." });
  const { reason, error: reasonError } = readAdminReason(req);
  if (reasonError) return res.status(400).json({ error: reasonError });
  if (!reason) return res.status(400).json({ error: "Enter a reason before permanently deleting a product page." });

  try {
    const result = await permanentlyDeleteAdminProductPage(id, adminUsername, reason);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleAdminProductPageError(error, res, "Unable to permanently delete product page.");
  }
});


const ADMIN_PAYMENT_STATUSES: AdminPaymentStatusFilter[] = [
  "all",
  "pending",
  "success",
  "failed",
  "invalid",
];
const ADMIN_REFUND_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADMIN_PAYMENT_REFERENCE = /^[A-Za-z0-9._-]{1,100}$/;

function handleAdminPaymentError(error: unknown, res: Response, fallback: string) {
  if (error instanceof AdminPaymentError) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

async function requireAuditAvailability(res: Response, event: {
  actorUsername: string;
  action: string;
  entityType: string;
  entityId: string | null;
  reason?: string | null;
  details?: Record<string, string | number | boolean | null>;
}) {
  try {
    await recordAdminAuditEvent({ ...event, outcome: "started" });
    return true;
  } catch (error) {
    console.error("Admin financial-action audit log unavailable:", error);
    res.status(503).json({
      error: "The admin audit log is unavailable. No payment or refund action was started. Check the admin foundation migration and try again.",
    });
    return false;
  }
}

async function recordActionOutcome(event: {
  actorUsername: string;
  action: string;
  entityType: string;
  entityId: string | null;
  outcome: "succeeded" | "failed";
  reason?: string | null;
  details?: Record<string, string | number | boolean | null>;
}) {
  try {
    await recordAdminAuditEvent(event);
  } catch (error) {
    // A provider action that already happened must not be represented as failed
    // merely because the follow-up audit append failed. Surface the issue in logs.
    console.error("Unable to write admin payment-action outcome:", error);
  }
}

router.get("/payments", async (req, res) => {
  const rawStatus = typeof req.query.status === "string" ? req.query.status : "all";
  if (!ADMIN_PAYMENT_STATUSES.includes(rawStatus as AdminPaymentStatusFilter)) {
    return res.status(400).json({ error: "Invalid payment status filter." });
  }
  const rawPage = typeof req.query.page === "string" ? Number(req.query.page) : 1;
  const rawPageSize = typeof req.query.pageSize === "string" ? Number(req.query.pageSize) : 20;
  const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1_000_000) : 1;
  const pageSize = Number.isInteger(rawPageSize) ? Math.max(1, Math.min(50, rawPageSize)) : 20;
  const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";

  try {
    const result = await listAdminPayments({
      search,
      status: rawStatus as AdminPaymentStatusFilter,
      page,
      pageSize,
    });
    res.set("Cache-Control", "no-store");
    return res.status(200).json(result);
  } catch (error) {
    return handleAdminPaymentError(error, res, "Unable to load payment records.");
  }
});

router.get("/payments/:reference", async (req, res) => {
  const reference = req.params.reference;
  if (typeof reference !== "string" || !ADMIN_PAYMENT_REFERENCE.test(reference)) {
    return res.status(400).json({ error: "Invalid payment reference." });
  }
  try {
    const detail = await getAdminPaymentDetail(reference);
    if (!detail) return res.status(404).json({ error: "Payment reference not found." });
    res.set("Cache-Control", "no-store");
    return res.status(200).json(detail);
  } catch (error) {
    return handleAdminPaymentError(error, res, "Unable to load payment details.");
  }
});

router.post("/payments/:reference/verify", async (req, res) => {
  const reference = req.params.reference;
  if (typeof reference !== "string" || !ADMIN_PAYMENT_REFERENCE.test(reference)) {
    return res.status(400).json({ error: "Invalid payment reference." });
  }
  const actorUsername = getAdminUsername(res);
  if (!actorUsername) return res.status(401).json({ error: "Admin authentication required." });
  if (!(await requireAuditAvailability(res, {
    actorUsername,
    action: "admin.payment.verify",
    entityType: "payment",
    entityId: reference,
  }))) return;

  try {
    const verification = await verifyAdminPaymentWithPaystack(reference);
    const successful = verification.matched && !["manual_review", "mismatch"].includes(verification.outcome);
    await recordActionOutcome({
      actorUsername,
      action: "admin.payment.verify",
      entityType: "payment",
      entityId: reference,
      outcome: successful ? "succeeded" : "failed",
      reason: successful ? null : verification.message,
      details: {
        providerStatus: verification.providerStatus,
        outcome: verification.outcome,
        matched: verification.matched,
      },
    });
    const detail = await getAdminPaymentDetail(reference);
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ verification, ...detail });
  } catch (error) {
    await recordActionOutcome({
      actorUsername,
      action: "admin.payment.verify",
      entityType: "payment",
      entityId: reference,
      outcome: "failed",
      reason: error instanceof Error ? error.message : "Payment verification failed.",
      details: { errorCode: error instanceof AdminPaymentError ? error.code : "UNEXPECTED_ERROR" },
    });
    return handleAdminPaymentError(error, res, "Unable to verify payment with Paystack.");
  }
});

router.post("/payments/:reference/refunds", refundActionLimiter, async (req, res) => {
  const reference = req.params.reference;
  if (typeof reference !== "string" || !ADMIN_PAYMENT_REFERENCE.test(reference)) {
    return res.status(400).json({ error: "Invalid payment reference." });
  }
  const actorUsername = getAdminUsername(res);
  if (!actorUsername) return res.status(401).json({ error: "Admin authentication required." });

  const amountKobo = req.body?.amountKobo;
  const reasonValue = req.body?.reason;
  const requestId = req.body?.requestId;
  if (typeof amountKobo !== "number" || !Number.isSafeInteger(amountKobo) || amountKobo <= 0) {
    return res.status(400).json({ error: "Refund amount must be a positive whole number of kobo." });
  }
  if (typeof reasonValue !== "string" || reasonValue.trim().length < 3 || reasonValue.trim().length > 1000) {
    return res.status(400).json({ error: "Enter a refund reason between 3 and 1,000 characters." });
  }
  if (typeof requestId !== "string" || !ADMIN_REFUND_ID.test(requestId)) {
    return res.status(400).json({ error: "A valid refund request ID is required." });
  }

  if (!(await requireAuditAvailability(res, {
    actorUsername,
    action: "admin.refund.initiate",
    entityType: "payment",
    entityId: reference,
    reason: reasonValue.trim(),
    details: { amountKobo },
  }))) return;

  try {
    const result = await initiateAdminPaymentRefund({
      reference,
      amountKobo,
      reason: reasonValue.trim(),
      createdBy: actorUsername,
      requestId,
    });
    await recordActionOutcome({
      actorUsername,
      action: "admin.refund.initiate",
      entityType: "refund",
      entityId: result.refund.id,
      outcome: "succeeded",
      reason: reasonValue.trim(),
      details: {
        amountKobo: result.refund.amountKobo,
        refundStatus: result.refund.status,
        replayed: result.replayed,
      },
    });
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ ...result, payment: await getAdminPaymentDetail(reference) });
  } catch (error) {
    await recordActionOutcome({
      actorUsername,
      action: "admin.refund.initiate",
      entityType: "payment",
      entityId: reference,
      outcome: "failed",
      reason: error instanceof Error ? error.message : "Refund initiation failed.",
      details: {
        amountKobo,
        errorCode: error instanceof AdminPaymentError ? error.code : "UNEXPECTED_ERROR",
      },
    });
    return handleAdminPaymentError(error, res, "Unable to initiate refund.");
  }
});

router.post("/refunds/:id/refresh", async (req, res) => {
  const id = req.params.id;
  if (typeof id !== "string" || !ADMIN_REFUND_ID.test(id)) {
    return res.status(400).json({ error: "Invalid refund ID." });
  }
  const actorUsername = getAdminUsername(res);
  if (!actorUsername) return res.status(401).json({ error: "Admin authentication required." });
  const existing = await getAdminRefundById(id).catch((error) => {
    console.error("Unable to load refund before refresh:", error);
    return null;
  });
  if (!existing) return res.status(404).json({ error: "Refund record not found." });
  if (!(await requireAuditAvailability(res, {
    actorUsername,
    action: "admin.refund.refresh",
    entityType: "refund",
    entityId: id,
  }))) return;

  try {
    const refund = await refreshAdminRefundFromPaystack(id);
    await recordActionOutcome({
      actorUsername,
      action: "admin.refund.refresh",
      entityType: "refund",
      entityId: id,
      outcome: "succeeded",
      details: { refundStatus: refund.status },
    });
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ refund, payment: await getAdminPaymentDetail(refund.paymentReference) });
  } catch (error) {
    await recordActionOutcome({
      actorUsername,
      action: "admin.refund.refresh",
      entityType: "refund",
      entityId: id,
      outcome: "failed",
      reason: error instanceof Error ? error.message : "Refund refresh failed.",
      details: { errorCode: error instanceof AdminPaymentError ? error.code : "UNEXPECTED_ERROR" },
    });
    return handleAdminPaymentError(error, res, "Unable to refresh refund status.");
  }
});

export default router;
