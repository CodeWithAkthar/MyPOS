import { register, collectDefaultMetrics, Histogram, Counter, Gauge } from "prom-client";

// Collect default metrics (CPU, memory, event loop lag, etc.)
collectDefaultMetrics({ register });

// Histogram for tracking HTTP request/response time
export const reqResTime = new Histogram({
  name: "http_express_req_res_time",
  help: "This tells how much time is taken by req and res",
  labelNames: ["method", "route", "status_code", "instance"],
  buckets: [1, 50, 100, 200, 400, 500, 800, 1000, 2000],
});

// Counter for total HTTP requests
export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code", "instance"],
});

// Gauge for active/in-flight requests
export const httpRequestsInFlight = new Gauge({
  name: "http_requests_in_flight",
  help: "Number of HTTP requests currently being processed",
  labelNames: ["method", "instance"],
});

// Histogram for response size in bytes
export const httpResponseSizeBytes = new Histogram({
  name: "http_response_size_bytes",
  help: "Size of HTTP responses in bytes",
  labelNames: ["method", "route", "status_code", "instance"],
  buckets: [100, 1000, 5000, 10000, 50000, 100000, 500000, 1000000],
});

// Counter for HTTP errors (4xx and 5xx)
export const httpErrorsTotal = new Counter({
  name: "http_errors_total",
  help: "Total number of HTTP errors",
  labelNames: ["method", "route", "status_code", "error_type", "instance"],
});

// Export the registry to be used by the metrics endpoint
export { register };
