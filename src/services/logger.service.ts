import winston from "winston";
import morgan from "morgan";
import { Request, Response } from "express";
import getConfig from "../config";

const config = getConfig();

// ============================================
// WINSTON CONFIGURATION
// ============================================

// Custom log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Colors for development console
const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "blue",
};

winston.addColors(colors);

// Log format for development (colorized, readable)
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} ${level}: ${message}${metaStr}`;
  }),
);

// Log format for production (JSON, structured)
const prodFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// Determine log level based on environment
const level = config.server.isProduction ? "http" : "debug";

// Determine log format: 'dev' = readable, 'json' = structured, 'auto' = based on isProduction
const useJsonFormat = config.server.logFormat === "json" || (config.server.logFormat === "auto" && config.server.isProduction);

// Create Winston logger
const logger = winston.createLogger({
  levels,
  level,
  format: useJsonFormat ? prodFormat : devFormat,
  defaultMeta: {
    instanceId: config.server.instanceId,
  },
  transports: [new winston.transports.Console()],
});

// ============================================
// MORGAN CONFIGURATION
// ============================================

// Custom Morgan tokens
morgan.token("response-time-ms", (req, res) => {
  const responseTime = res.getHeader("X-Response-Time");
  return responseTime ? String(responseTime).replace("ms", "") : "-";
});

// Request ID token for Morgan
morgan.token("request-id", (req: Request) => req.requestId || "-");

// Production Morgan format - structured JSON with requestId
const prodMorganFormat: morgan.FormatFn<Request, Response> = (tokens, req, res) => {
  return JSON.stringify({
    requestId: req.requestId || "-",
    method: tokens.method(req, res),
    url: tokens.url(req, res),
    status: Number(tokens.status(req, res)),
    responseTime: Number(tokens["response-time"](req, res)),
    contentLength: tokens.res(req, res, "content-length") || 0,
    userAgent: tokens["user-agent"](req, res),
    ip: tokens["remote-addr"](req, res),
    referrer: tokens.referrer(req, res) || "-",
  });
};

// Development Morgan format - with requestId
const devMorganFormat = ":remote-addr :request-id :method :url :status :response-time ms - :res[content-length]";

// Morgan stream to Winston
const morganWinstonStream = {
  write: (message: string) => {
    if (useJsonFormat) {
      try {
        const data = JSON.parse(message);
        logger.http("HTTP Request", data);
      } catch {
        logger.http(message.trim());
      }
    } else {
      logger.http(message.trim());
    }
  },
};

// Create Morgan middleware based on environment
const createMorganMiddleware = () => {
  const options = {
    stream: morganWinstonStream,
    skip: (req: Request) => req.originalUrl.startsWith("/prom-metrics"),
  };

  if (useJsonFormat) {
    return morgan<Request, Response>(prodMorganFormat, options);
  }
  return morgan(devMorganFormat, options);
};

// Export Morgan middleware
export const morganMiddleware = createMorganMiddleware();

// Legacy stream export for compatibility
export const morganStream = {
  write: (message: string) => logger.http(message.trim()),
};

/**
 * Create a child logger with requestId for request-scoped logging
 * Usage: const reqLogger = withRequestId(req.requestId);
 *        reqLogger.info("User action", { userId: "123" });
 */
export const withRequestId = (requestId: string) => {
  return logger.child({ requestId });
};

export default logger;
