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

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
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

function requireAdmin(req: Request, res: Response) {
  const admin = getAuthenticatedAdmin(req);

  if (!admin) {
    res.status(401).json({
      error: "Admin authentication required.",
    });
    return null;
  }

  return admin;
}

router.post("/login", loginLimiter, (req, res) => {
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

  const token = createAdminSessionToken(username.trim());
  res.set("Cache-Control", "no-store");

  return res.status(200).json({
    success: true,
    token,
    expiresInSeconds: 12 * 60 * 60,
  });
});

router.get("/session", (req, res) => {
  const admin = requireAdmin(req, res);

  if (!admin) {
    return;
  }

  res.set("Cache-Control", "no-store");

  return res.status(200).json({
    authenticated: true,
    username: admin.username,
    expiresAt: admin.expiresAt,
  });
});

router.get("/analytics", async (req, res) => {
  const admin = requireAdmin(req, res);

  if (!admin) {
    return;
  }

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

export default router;
