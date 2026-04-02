import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing the service
vi.mock("../repository/auth.repository", () => ({
  default: {
    findCompanyByCode: vi.fn(),
    findUserByUsernameAndCompany: vi.fn(),
    getBrandStatus: vi.fn(),
    getOutletStatus: vi.fn(),
    createSession: vi.fn(),
    getUserWithPopulatedRelations: vi.fn(),
    deleteSessionByToken: vi.fn(),
  },
}));

vi.mock("../services/jwt.service", () => ({
  default: {
    createJwtByUserId: vi.fn(() => "mock-jwt-token"),
  },
}));

vi.mock("../services/password.service", () => ({
  default: {
    verifyHash: vi.fn(),
  },
}));

// Import after mocking
import authService from "../services/auth.service";
import authRepository from "../repository/auth.repository";
import passwordService from "../services/password.service";

// ============================================
// MOCK DATA
// ============================================

const mockCompany = {
  _id: { toString: () => "company-id-123" },
  companyCode: "TEST_COMPANY",
  name: "Test Company",
  status: "active",
};

const mockUser = {
  _id: { toString: () => "user-id-123" },
  username: "testuser",
  password: "hashed-password",
  brandId: "brand-id-123",
  outletId: "outlet-id-123",
  companyId: "company-id-123",
};

const mockPopulatedUser = {
  _id: "user-id-123",
  username: "testuser",
  brandId: { _id: "brand-id-123", name: "Test Brand" },
  outletId: { _id: "outlet-id-123", name: "Test Outlet" },
  companyId: { _id: "company-id-123", name: "Test Company" },
};

// ============================================
// TESTS
// ============================================

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // signIn - Validation Tests
  // ============================================

  describe("signIn - Validation", () => {
    it("should throw 400 when username is missing", async () => {
      await expect(authService.signIn({ username: "", password: "test", companyCode: "TEST" })).rejects.toMatchObject({
        status: 400,
        message: "Username is required",
      });
    });

    it("should throw 400 when password is missing", async () => {
      await expect(authService.signIn({ username: "test", password: "", companyCode: "TEST" })).rejects.toMatchObject({
        status: 400,
        message: "Password is required",
      });
    });

    it("should throw 400 when companyCode is missing", async () => {
      await expect(authService.signIn({ username: "test", password: "test", companyCode: "" })).rejects.toMatchObject({
        status: 400,
        message: "Company code is required",
      });
    });
  });

  // ============================================
  // signIn - Company Validation
  // ============================================

  describe("signIn - Company Validation", () => {
    it("should throw 404 when company not found", async () => {
      vi.mocked(authRepository.findCompanyByCode).mockResolvedValue(null);

      await expect(authService.signIn({ username: "test", password: "test", companyCode: "INVALID" })).rejects.toMatchObject({
        status: 404,
        message: "Company not found",
      });
    });

    it("should throw 403 when company is inactive", async () => {
      vi.mocked(authRepository.findCompanyByCode).mockResolvedValue({
        ...mockCompany,
        status: "inactive",
      } as any);

      await expect(authService.signIn({ username: "test", password: "test", companyCode: "TEST" })).rejects.toMatchObject({
        status: 403,
        message: "Company is inactive. Please contact support.",
      });
    });
  });

  // ============================================
  // signIn - User Validation
  // ============================================

  describe("signIn - User Validation", () => {
    beforeEach(() => {
      vi.mocked(authRepository.findCompanyByCode).mockResolvedValue(mockCompany as any);
    });

    it("should throw 404 when user not found in company", async () => {
      vi.mocked(authRepository.findUserByUsernameAndCompany).mockResolvedValue(null);

      await expect(authService.signIn({ username: "unknown", password: "test", companyCode: "TEST" })).rejects.toMatchObject({
        status: 404,
        message: "User not found in this company",
      });
    });

    it("should throw 400 when password is invalid", async () => {
      vi.mocked(authRepository.findUserByUsernameAndCompany).mockResolvedValue(mockUser as any);
      vi.mocked(passwordService.verifyHash).mockReturnValue(false);

      await expect(authService.signIn({ username: "testuser", password: "wrong", companyCode: "TEST" })).rejects.toMatchObject({
        status: 400,
        message: "Invalid credentials",
      });
    });
  });

  // ============================================
  // signIn - Brand/Outlet Status
  // ============================================

  describe("signIn - Access Checks", () => {
    beforeEach(() => {
      vi.mocked(authRepository.findCompanyByCode).mockResolvedValue(mockCompany as any);
      vi.mocked(authRepository.findUserByUsernameAndCompany).mockResolvedValue(mockUser as any);
      vi.mocked(passwordService.verifyHash).mockReturnValue(true);
    });

    it("should throw 403 when brand is inactive", async () => {
      vi.mocked(authRepository.getBrandStatus).mockResolvedValue({ status: "inactive" } as any);

      await expect(authService.signIn({ username: "testuser", password: "correct", companyCode: "TEST" })).rejects.toMatchObject({
        status: 403,
        message: "Brand is inactive. Please contact support.",
      });
    });

    it("should throw 403 when outlet is inactive", async () => {
      vi.mocked(authRepository.getBrandStatus).mockResolvedValue({ status: "active" } as any);
      vi.mocked(authRepository.getOutletStatus).mockResolvedValue({ status: "inactive" } as any);

      await expect(authService.signIn({ username: "testuser", password: "correct", companyCode: "TEST" })).rejects.toMatchObject({
        status: 403,
        message: "Outlet is inactive. Please contact support.",
      });
    });
  });

  // ============================================
  // signIn - Success Case
  // ============================================

  describe("signIn - Success", () => {
    beforeEach(() => {
      vi.mocked(authRepository.findCompanyByCode).mockResolvedValue(mockCompany as any);
      vi.mocked(authRepository.findUserByUsernameAndCompany).mockResolvedValue(mockUser as any);
      vi.mocked(passwordService.verifyHash).mockReturnValue(true);
      vi.mocked(authRepository.getBrandStatus).mockResolvedValue({ status: "active" } as any);
      vi.mocked(authRepository.getOutletStatus).mockResolvedValue({ status: "active" } as any);
      vi.mocked(authRepository.createSession).mockResolvedValue({} as any);
      vi.mocked(authRepository.getUserWithPopulatedRelations).mockResolvedValue(mockPopulatedUser as any);
    });

    it("should return JWT token and user data on successful login", async () => {
      const result = await authService.signIn({
        username: "testuser",
        password: "correct",
        companyCode: "TEST",
      });

      expect(result).toMatchObject({
        jwtToken: "mock-jwt-token",
        user: mockPopulatedUser,
      });
    });

    it("should create auth session in database", async () => {
      await authService.signIn(
        {
          username: "testuser",
          password: "correct",
          companyCode: "TEST",
        },
        "Mozilla/5.0",
      );

      expect(authRepository.createSession).toHaveBeenCalledWith({
        uid: "user-id-123",
        token: "mock-jwt-token",
        userAgent: "Mozilla/5.0",
      });
    });
  });

  // ============================================
  // logout Tests
  // ============================================

  describe("logout", () => {
    it("should throw 400 when token is not provided", async () => {
      await expect(authService.logout("")).rejects.toMatchObject({
        status: 400,
        message: "Token not found",
      });
    });

    it("should delete session and return success message", async () => {
      vi.mocked(authRepository.deleteSessionByToken).mockResolvedValue({ deletedCount: 1 } as any);

      const result = await authService.logout("valid-token");

      expect(authRepository.deleteSessionByToken).toHaveBeenCalledWith("valid-token");
      expect(result).toMatchObject({
        message: "Logged out successfully",
      });
    });
  });
});
