import express from "express";
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
  }),
);

app.use(express.json({ limit: "64kb", strict: true }));

app.use("/sitemap.xml", sitemapRouter);

app.use("/api/product-pages", productPageFeedbackRouter);
app.use("/api/platform-analytics", platformAnalyticsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/product-pages", productPagePaymentsRouter);
app.use("/api/product-pages", productPageAnalyticsRouter);
app.use("/api/product-pages", productPagesRouter);

app.use("/api/health", healthRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/feedback", feedbackRouter);

export default app;
