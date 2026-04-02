import mongoose from "mongoose";
import getConfig from "../config";
import logger from "./logger.service";
import { mongooseTracePlugin } from "../utils/mongooseTracePlugin";

mongoose.plugin(mongooseTracePlugin);

const RECONNECT_DELAY_MS = 5000;
let isShuttingDown = false;

/**
 * Set shutdown flag to prevent reconnection attempts
 */
export const setShuttingDown = () => {
  isShuttingDown = true;
};

/**
 * Close MongoDB connection gracefully
 */
export const closeDb = async () => {
  setShuttingDown();
  await mongoose.connection.close();
};

const attemptReconnect = (url: string) => {
  if (isShuttingDown) {
    logger.info("Skipping reconnection - app is shutting down");
    return;
  }

  logger.info(`Attempting MongoDB reconnection in ${RECONNECT_DELAY_MS / 1000}s...`);

  setTimeout(async () => {
    try {
      await mongoose.connect(url);
    } catch (error: any) {
      logger.error("MongoDB reconnection failed", { error: error.message });
      // Will trigger 'disconnected' event which calls attemptReconnect again
    }
  }, RECONNECT_DELAY_MS);
};

export const connectToDb = () => {
  const config = getConfig();
  const connection = mongoose.connection;

  // ============================================
  // MONGODB CONNECTION EVENT HANDLERS
  // ============================================

  connection.on("connected", () => {
    logger.info("MongoDB connected successfully");
  });

  connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
    attemptReconnect(config.mongodb.url);
  });

  connection.on("reconnected", () => {
    logger.info("MongoDB reconnected");
  });

  connection.on("error", (error) => {
    logger.error("MongoDB connection error", { error: error.message });
  });

  connection.on("close", () => {
    logger.info("MongoDB connection closed gracefully");
  });

  // Connect to database
  const promise = mongoose.connect(config.mongodb.url);

  promise.catch((error) => {
    logger.error("MongoDB initial connection failed", { error: error.message });
    attemptReconnect(config.mongodb.url);
  });

  return promise;
};

export default connectToDb;
