import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import healthRouter from "./routes/health.js";
import paymentsRouter from "./routes/payments.js";
import feedbackRouter from "./routes/feedback.js";
import paystackWebhookRouter from "./routes/paystackWebhook.js";

const app = express();

app.disable("x-powered-by");

const configuredClientUrl = process.env.CLIENT_URL?.trim();
const allowedOrigins = new Set(
  [
    configuredClientUrl,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
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
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
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

app.use("/api/health", healthRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/feedback", feedbackRouter);

export default app;
