import { DeleteResult } from "mongoose";
import AuthModel from "../models/auth";
import UserModel from "../models/user";
import CompanyModel from "../models/company";
import BrandModel from "../models/brand";
import OutletsModel from "../models/outlets";
import { AuthSession, CreateAuthSessionPayload } from "../types/auth.types";

// ============================================
// SESSION OPERATIONS
// ============================================

/**
 * Create a new auth session (token whitelist entry)
 */
export async function createSession(data: CreateAuthSessionPayload): Promise<AuthSession> {
  const session = new AuthModel(data);
  await session.save();
  return session.toObject();
}

/**
 * Get auth session by ID
 */
export async function getSessionById(id: string): Promise<AuthSession | null> {
  const session = await AuthModel.findOne({ _id: id });
  return session?.toObject() || null;
}

/**
 * Get auth session by JWT token
 */
export async function getSessionByToken(token: string): Promise<AuthSession | null> {
  const session = await AuthModel.findOne({ token });
  return session?.toObject() || null;
}

/**
 * Delete auth session by JWT token (logout)
 */
export async function deleteSessionByToken(token: string): Promise<DeleteResult> {
  return AuthModel.deleteOne({ token });
}

// ============================================
// USER LOOKUP OPERATIONS
// ============================================

/**
 * Find user by username and company ID
 */
export async function findUserByUsernameAndCompany(username: string, companyId: string) {
  return UserModel.findOne({
    username,
    companyId,
  });
}

/**
 * Get user with populated relations (for auth response)
 */
export async function getUserWithPopulatedRelations(userId: string) {
  return UserModel.findById(userId)
    .select({ password: 0 })
    .populate("brandId")
    .populate({ path: "outletId", populate: { path: "brandId" } })
    .populate("companyId");
}

// ============================================
// COMPANY/BRAND/OUTLET STATUS CHECKS
// ============================================

/**
 * Find company by company code
 */
export async function findCompanyByCode(companyCode: string) {
  return CompanyModel.findOne({ companyCode });
}

/**
 * Get brand status by ID
 */
export async function getBrandStatus(brandId: string) {
  return BrandModel.findById(brandId).select("status");
}

/**
 * Get outlet status by ID
 */
export async function getOutletStatus(outletId: string) {
  return OutletsModel.findById(outletId).select("status");
}

/**
 * Get company status by ID
 */
export async function getCompanyStatus(companyId: string) {
  return CompanyModel.findById(companyId).select("status");
}

// ============================================
// EXPORT
// ============================================

const authRepository = {
  // Session operations
  createSession,
  getSessionById,
  getSessionByToken,
  deleteSessionByToken,

  // User lookup
  findUserByUsernameAndCompany,
  getUserWithPopulatedRelations,

  // Status checks
  findCompanyByCode,
  getBrandStatus,
  getOutletStatus,
  getCompanyStatus,
};

export default authRepository;
