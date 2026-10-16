import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import healthRouter from "./routes/health.js";
import paymentsRouter from "./routes/payments.js";
import feedbackRouter from "./routes/feedback.js";
import paystackWebhookRouter from "./routes/paystackWebhook.js";
import productPagesRouter from "./routes/productPages.js";
import productPageAnalyticsRouter from "./routes/productPageAnalytics.js";
import productPagePaymentsRouter from "./routes/productPagePayments.js";
import productPageEditLinkRecoveryRouter from "./routes/productPageEditLinkRecovery.js";
import productPageFeedbackRouter from "./routes/productPageFeedback.js";
import sitemapRouter from "./routes/sitemap.js";
import platformAnalyticsRouter from "./routes/platformAnalytics.js";
import adminRouter from "./routes/admin.js";

const app = express();

app.set("trust proxy", 1);

app.disable("x-powered-by");

const configuredClientUrl = process.env.CLIENT_URL?.trim();

const allowedOrigins = new Set(
  [
    configuredClientUrl,
    ...(process.env.NODE_ENV !== "production"
      ? [
          "http://localhost:5173",
          "http://127.0.0.1:5173",
        ]
      : []),
  ].filter((value): value is string => Boolean(value)),
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(helmet());

/*
 * Paystack signs the exact raw request body. Mount the webhook
 * before express.json() so req.body remains a Buffer.
 */
app.use(
  "/api/payments/webhook",
  express.raw({
    type: "application/json",
    limit: "1mb",
  }),
  paystackWebhookRouter,
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.status(429).json({ error: "Too many requests. Please wait and try again." });
    },
  }),
);

app.use(express.json({ limit: "64kb", strict: true }));

// Edit tokens are bearer credentials. Never let browsers or intermediary caches
// store private seller data returned by any product-pages edit endpoint.
app.use("/api/product-pages/edit/:token", (_req, res, next) => {
  res.set({
    "Cache-Control": "no-store, private, max-age=0",
    Pragma: "no-cache",
  });
  next();
});

app.use("/sitemap.xml", sitemapRouter);

app.use("/api/product-pages", productPageFeedbackRouter);
app.use("/api/platform-analytics", platformAnalyticsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/product-pages", productPageEditLinkRecoveryRouter);
app.use("/api/product-pages", productPagePaymentsRouter);
app.use("/api/product-pages", productPageAnalyticsRouter);
app.use("/api/product-pages", productPagesRouter);

app.use("/api/health", healthRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/feedback", feedbackRouter);

// Keep malformed/oversized requests and unexpected middleware failures on a
// predictable JSON API contract without exposing stack traces or request data.
const apiErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const details = error && typeof error === "object"
    ? error as { type?: unknown; status?: unknown }
    : {};

  res.setHeader("Cache-Control", "no-store");

  if (details.type === "entity.parse.failed" || (error instanceof SyntaxError && details.status === 400)) {
    res.status(400).json({ error: "Invalid JSON request body." });
    return;
  }

  if (details.type === "entity.too.large" || details.status === 413) {
    res.status(413).json({ error: "Request body is too large." });
    return;
  }

  console.error("Unhandled API middleware error:", {
    method: req.method,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  res.status(500).json({ error: "Unexpected server error." });
};

app.use(apiErrorHandler);

export default app;
