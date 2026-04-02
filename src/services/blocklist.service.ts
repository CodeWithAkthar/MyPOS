/**
 * Phase 2: Blocklist Population Service
 *
 * This file provides initialization and helper functions for managing
 * the blocklist cache that prevents inactive entities from accessing the system.
 *
 * Usage:
 * 1. Call initializeBlocklists() on server startup (after DB connection)
 * 2. Import blockEntity() in your controllers to add entities to blocklist
 * 3. Import unblockEntity() to remove entities from blocklist
 */

import { blockedCompanies, blockedBrands, blockedOutlets, userDataCatch } from "../utils/catch.db";
import CompanyModel from "../models/company";
import BrandModel from "../models/brand";
import OutletsModel from "../models/outlets";
import logger from "./logger.service";

/**
 * Initialize blocklists on server startup
 * Loads all currently inactive entities into memory for instant lookups
 */
export const initializeBlocklists = async () => {
  try {
    const startTime = Date.now();

    // Load all inactive companies
    const inactiveCompanies = await CompanyModel.find({ status: "inactive" }).select("_id").lean();
    inactiveCompanies.forEach((company) => blockedCompanies.add(company._id.toString()));

    // Load all inactive brands
    const inactiveBrands = await BrandModel.find({ status: "inactive" }).select("_id").lean();
    inactiveBrands.forEach((brand) => blockedBrands.add(brand._id.toString()));

    // Load all inactive outlets
    const inactiveOutlets = await OutletsModel.find({ status: "inactive" }).select("_id").lean();
    inactiveOutlets.forEach((outlet) => blockedOutlets.add(outlet._id.toString()));

    const duration = Date.now() - startTime;

    logger.info(
      `Blocklists initialized in ${duration}ms: ` +
        `${blockedCompanies.size} companies, ` +
        `${blockedBrands.size} brands, ` +
        `${blockedOutlets.size} outlets`,
    );
  } catch (error) {
    logger.error("Failed to initialize blocklists:", error);
    throw error; // Fail fast if blocklists can't be initialized
  }
};

/**
 * Add an entity to the blocklist
 * @param entityType - Type of entity ('company' | 'brand' | 'outlet')
 * @param entityId - ID of the entity to block
 */
export const blockEntity = (entityType: "company" | "brand" | "outlet", entityId: string) => {
  switch (entityType) {
    case "company":
      blockedCompanies.add(entityId);
      logger.info(`Blocked company: ${entityId}`);
      // Invalidate user caches for this company
      invalidateUsersByEntity("companyId", entityId);
      break;
    case "brand":
      blockedBrands.add(entityId);
      logger.info(`Blocked brand: ${entityId}`);
      invalidateUsersByEntity("brandId", entityId);
      break;
    case "outlet":
      blockedOutlets.add(entityId);
      logger.info(`Blocked outlet: ${entityId}`);
      invalidateUsersByEntity("outletId", entityId);
      break;
  }
};

/**
 * Remove an entity from the blocklist
 * @param entityType - Type of entity ('company' | 'brand' | 'outlet')
 * @param entityId - ID of the entity to unblock
 */
export const unblockEntity = (entityType: "company" | "brand" | "outlet", entityId: string) => {
  switch (entityType) {
    case "company":
      blockedCompanies.delete(entityId);
      logger.info(`Unblocked company: ${entityId}`);
      // Invalidate caches so users can re-authenticate
      invalidateUsersByEntity("companyId", entityId);
      break;
    case "brand":
      blockedBrands.delete(entityId);
      logger.info(`Unblocked brand: ${entityId}`);
      invalidateUsersByEntity("brandId", entityId);
      break;
    case "outlet":
      blockedOutlets.delete(entityId);
      logger.info(`Unblocked outlet: ${entityId}`);
      invalidateUsersByEntity("outletId", entityId);
      break;
  }
};

/**
 * Invalidate cached user data for all users belonging to an entity
 * @param field - User field to match ('companyId' | 'brandId' | 'outletId')
 * @param entityId - Entity ID to match
 */
const invalidateUsersByEntity = (field: "companyId" | "brandId" | "outletId", entityId: string) => {
  let count = 0;
  userDataCatch.forEach((user, key) => {
    if (user?.[field] === entityId) {
      userDataCatch.delete(key);
      count++;
    }
  });
  logger.debug(`Invalidated ${count} user caches for ${field}=${entityId}`);
};

/**
 * Get blocklist statistics (for monitoring/debugging)
 */
export const getBlocklistStats = () => {
  return {
    blockedCompanies: blockedCompanies.size,
    blockedBrands: blockedBrands.size,
    blockedOutlets: blockedOutlets.size,
    cachedUsers: userDataCatch.size,
  };
};
