import responseTime from "response-time";
import { reqResTime, httpRequestsTotal, httpRequestsInFlight, httpResponseSizeBytes, httpErrorsTotal } from "../services/metrics.service";
import { Request } from "express";

// Get instance identifier (PM2 sets NODE_APP_INSTANCE)
const INSTANCE_ID = process.env.NODE_APP_INSTANCE || process.pid.toString();

/**
 * Normalize route to prevent high cardinality in Prometheus metrics
 * Replaces dynamic segments (IDs, UUIDs) with placeholders
 *
 * Examples:
 * /orders/507f1f77bcf86cd799439011 → /orders/:id
 * /menu/items/123/edit → /menu/items/:id/edit
 * /users/john.doe@email.com → /users/:email
 */
function normalizeRoute(path: string): string {
  return (
    path
      // Replace MongoDB ObjectIds (24 hex chars)
      .replace(/\/[0-9a-f]{24}/gi, "/:id")
      // Replace UUIDs
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:uuid")
      // Replace numeric IDs
      .replace(/\/\d+/g, "/:id")
      // Replace email addresses
      .replace(/\/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "/:email")
      // Remove query parameters (important!)
      .split("?")[0]
  );
}

// Middleware to track comprehensive HTTP metrics using Prometheus
export const latencyMonitorMiddleware = responseTime((req, res, time) => {
  const urlReq: Request & { originalUrl: string } = req as any;
  const url = new URL(`${urlReq.protocol}://${urlReq.host}${urlReq.originalUrl}`);

  // Normalize route to prevent unbounded cardinality
  const normalizedRoute = normalizeRoute(url.pathname);

  const labels = {
    method: urlReq.method,
    route: normalizedRoute, // Use normalized route instead of originalUrl
    status_code: res.statusCode.toString(),
    instance: INSTANCE_ID,
  };

  // Record request/response time
  reqResTime.labels(labels).observe(time);

  // Increment total requests counter
  httpRequestsTotal.labels(labels).inc();

  // Record response size if available
  const contentLength = res.getHeader("content-length");
  if (contentLength) {
    httpResponseSizeBytes.labels(labels).observe(parseInt(contentLength as string, 10));
  }

  // Track errors (4xx and 5xx status codes)
  const statusCode = res.statusCode;
  if (statusCode >= 400) {
    const errorType = statusCode >= 500 ? "server_error" : "client_error";
    httpErrorsTotal
      .labels({
        ...labels,
        error_type: errorType,
      })
      .inc();
  }
});

// Middleware to track active/in-flight requests
export const activeRequestsMiddleware = (req: any, res: any, next: any) => {
  const method = req.method;
  let hasFinished = false;

  // Increment gauge when request starts
  httpRequestsInFlight.labels({ method, instance: INSTANCE_ID }).inc();

  // Decrement gauge when request finishes (only once)
  const cleanup = () => {
    if (!hasFinished) {
      hasFinished = true;
      httpRequestsInFlight.labels({ method, instance: INSTANCE_ID }).dec();
    }
  };

  res.on("finish", cleanup);
  res.on("close", cleanup);

  next();
};
