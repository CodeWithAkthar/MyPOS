import authRepository from "../repository/auth.repository";
import jwtService from "./jwt.service";
import passwordService from "./password.service";
import logger, { withRequestId } from "./logger.service";
import { SignInRequest, SignInResponse, LogoutResponse } from "../types/auth.types";
import Utils from "../utils";

const utils = new Utils();

// ============================================
// AUTH SERVICE
// ============================================

class AuthService {
  /**
   * Authenticate user and create session
   */
  async signIn(credentials: SignInRequest, userAgent?: string, requestId?: string): Promise<SignInResponse> {
    const log = requestId ? withRequestId(requestId) : logger;
    // Validate required fields
    this.validateCredentials(credentials);

    // Find and validate company
    const company = await this.validateCompany(credentials.companyCode);

    // Find user in company
    const user = await authRepository.findUserByUsernameAndCompany(credentials.username, company._id.toString());

    if (!user) {
      throw utils.createError(404, "User not found in this company");
    }

    // Verify password
    const isValidPassword = await passwordService.verifyHash(credentials.password, user.password as string);

    if (!isValidPassword) {
      throw utils.createError(400, "Invalid credentials");
    }

    // Check brand/outlet status
    await this.validateUserAccess(user);

    // Generate JWT token
    const jwtToken = jwtService.createJwtByUserId(user._id.toString());

    // Create auth session in database
    await authRepository.createSession({
      uid: user._id.toString(),
      token: jwtToken,
      userAgent,
    });

    // Get populated user data for response
    const populatedUser = await authRepository.getUserWithPopulatedRelations(user._id.toString());

    log.info("User signed in successfully", {
      userId: user._id.toString(),
      username: credentials.username,
      companyCode: credentials.companyCode,
    });

    return {
      jwtToken,
      user: populatedUser,
    };
  }

  /**
   * Logout user and invalidate session
   */
  async logout(token: string, requestId?: string): Promise<LogoutResponse> {
    const log = requestId ? withRequestId(requestId) : logger;

    if (!token) {
      throw utils.createError(400, "Token not found");
    }

    await authRepository.deleteSessionByToken(token);

    log.info("User logged out");

    return {
      message: "Logged out successfully",
    };
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  /**
   * Validate sign-in credentials
   */
  private validateCredentials(credentials: SignInRequest): void {
    if (!credentials.username) {
      throw utils.createError(400, "Username is required");
    }
    if (!credentials.password) {
      throw utils.createError(400, "Password is required");
    }
    if (!credentials.companyCode) {
      throw utils.createError(400, "Company code is required");
    }
  }

  /**
   * Find and validate company by code
   */
  private async validateCompany(companyCode: string) {
    const company = await authRepository.findCompanyByCode(companyCode);

    if (!company) {
      throw utils.createError(404, "Company not found");
    }

    if (company.status === "inactive") {
      throw utils.createError(403, "Company is inactive. Please contact support.");
    }

    return company;
  }

  /**
   * Check brand and outlet status for user access
   */
  private async validateUserAccess(user: any): Promise<void> {
    // Check brand status
    if (user.brandId) {
      const brand = await authRepository.getBrandStatus(user.brandId);
      if (brand && brand.status === "inactive") {
        throw utils.createError(403, "Brand is inactive. Please contact support.");
      }
    }

    // Check outlet status
    if (user.outletId) {
      const outlet = await authRepository.getOutletStatus(user.outletId);
      if (outlet && outlet.status === "inactive") {
        throw utils.createError(403, "Outlet is inactive. Please contact support.");
      }
    }
  }
}

// Export singleton instance
const authService = new AuthService();
export default authService;
