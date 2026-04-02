import http from "http";
import logger from "./logger.service";
import { closeDb } from "./db.service";
import getConfig from "../config";

/**
 * Graceful shutdown handler
 * Closes HTTP server and database connections before exiting
 */
async function gracefulShutdown(signal: string, server: http.Server) {
  const config = getConfig();
  logger.info(`${signal} received: starting graceful shutdown...`);

  // Safety timeout: force exit
  const forceExitTimeout = setTimeout(() => {
    logger.warn("Forcing shutdown after timeout");
    process.exit(1);
  }, config.server.shutdownTimeoutMs);
  forceExitTimeout.unref();

  try {
    // 1. Stop accepting new HTTP connections
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    logger.info("HTTP server closed");

    // 2. Close MongoDB connection
    await closeDb();

    logger.info("Graceful shutdown complete");
    process.exit(0);
  } catch (error: any) {
    logger.error("Error during shutdown", { error: error.message });
    process.exit(1);
  }
}

/**
 * Register shutdown handlers for SIGINT and SIGTERM
 */
export const registerShutdownHandlers = (server: http.Server) => {
  process.on("SIGINT", () => gracefulShutdown("SIGINT", server));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM", server));
};

export default registerShutdownHandlers;
