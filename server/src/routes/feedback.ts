import { Router } from "express";
import rateLimit from "express-rate-limit";
import { sendFeedbackEmail } from "../services/email.js";

const router = Router();

const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
});

const allowedReuse = new Set(["definitely", "maybe", "probably-not"]);
const allowedImprovements = new Set([
  "More styles",
  "Animated statuses",
  "Custom branding",
  "More categories",
  "More customization",
]);

interface FeedbackRecord {
  rating: number;
  reuseIntent: string;
  improvement?: string;
  comment?: string;
  createdAt: string;
}

const feedbackStore: FeedbackRecord[] = [];

router.post("/", feedbackLimiter, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const { rating, reuseIntent, improvement, comment } = req.body ?? {};

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({
      success: false,
      message: "Please provide a rating from 1 to 5.",
    });
    return;
  }

  if (typeof reuseIntent !== "string" || !allowedReuse.has(reuseIntent)) {
    res.status(400).json({
      success: false,
      message: "Please provide a valid reuse choice.",
    });
    return;
  }

  if (improvement !== undefined && (typeof improvement !== "string" || !allowedImprovements.has(improvement))) {
    res.status(400).json({
      success: false,
      message: "Please provide a valid improvement choice.",
    });
    return;
  }

  if (comment !== undefined && (typeof comment !== "string" || comment.trim().length > 1000)) {
    res.status(400).json({
      success: false,
      message: "Feedback comments must be 1,000 characters or fewer.",
    });
    return;
  }

  const record: FeedbackRecord = {
    rating,
    reuseIntent,
    improvement,
    comment: typeof comment === "string" && comment.trim() ? comment.trim() : undefined,
    createdAt: new Date().toISOString(),
  };

  // Phase 5 keeps feedback in memory for the MVP. Phase 6 can move it to persistent storage.
    feedbackStore.push(record);
  if (feedbackStore.length > 500) feedbackStore.shift();

  console.log("StatusFly feedback received:", record);

  try {
    await sendFeedbackEmail({
      rating,
      wouldUseAgain: reuseIntent,
      requestedFeature: improvement ?? "",
      message:
        typeof comment === "string" && comment.trim()
          ? comment.trim()
          : "",
    });

    res.status(201).json({
      success: true,
      message: "Feedback received. Thank you.",
    });
  } catch (error) {
    console.error("StatusFly feedback email error:", error);

    res.status(500).json({
      success: false,
      message: "We received your feedback, but could not send the notification email.",
    });
  }
});

export default router;
