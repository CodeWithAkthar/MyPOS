import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { trace } from "@opentelemetry/api";

/**
 * Request ID Middleware
 * Generates a unique ID for each request for distributed tracing
 * - Uses incoming X-Request-ID header if present (from load balancer/gateway)
 * - Generates a new UUID if not present
 * - Adds X-Request-ID to response headers
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Use existing request ID from upstream or generate new one
  const requestId = (req.headers["x-request-id"] as string) || crypto.randomBytes(8).toString("hex").slice(0, 15);

  // Attach to request object
  req.requestId = requestId;

  // Add to active OpenTelemetry span
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttribute("app.request_id", requestId);
  }

  // Add to response headers for client-side correlation
  res.setHeader("X-Request-ID", requestId);

  next();
};

export default requestIdMiddleware;
