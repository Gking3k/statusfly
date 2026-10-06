import { Router } from "express";
import {
  isValidPlatformAnalyticsEventType,
  isValidVisitorId,
  recordPlatformAnalyticsEvent,
  type PlatformAnalyticsEventType,
} from "../services/platformAnalytics.js";

const router = Router();

router.post("/events", async (req, res) => {
  try {
    const visitorId = req.body?.visitorId;
    const eventType = req.body?.eventType;

    if (!isValidVisitorId(visitorId)) {
      return res.status(400).json({
        error: "Invalid visitor ID.",
      });
    }

    if (!isValidPlatformAnalyticsEventType(eventType)) {
      return res.status(400).json({
        error: "Invalid analytics event.",
      });
    }

    await recordPlatformAnalyticsEvent(
      visitorId,
      eventType as PlatformAnalyticsEventType,
    );

    res.set("Cache-Control", "no-store");

    return res.status(202).json({
      success: true,
    });
  } catch (error) {
    console.error("Platform analytics error:", error);

    /* Analytics must never block the public product experience. */
    return res.status(202).json({
      success: false,
    });
  }
});

export default router;
