import { Router, Request, Response } from "express";
import { register } from "../services/metrics.service";
import logger from "../services/logger.service";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    res.set("Content-Type", register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error: any) {
    logger.error("Failed to collect metrics", { error: error.message });
    res.status(500).end("Error collecting metrics");
  }
});

export default router;
