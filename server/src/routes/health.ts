import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    service: "statusfly-api",
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

export default router;