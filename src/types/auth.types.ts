import { User } from "./user";

// ============================================
// REQUEST TYPES
// ============================================

/**
 * Sign-in request body
 */
export interface SignInRequest {
  username: string;
  password: string;
  companyCode: string;
}

// ============================================
// RESPONSE TYPES
// ============================================

/**
 * Sign-in response with JWT token and user data
 */
export interface SignInResponse {
  jwtToken: string;
  user: User | null;
}

/**
 * Logout response
 */
export interface LogoutResponse {
  message: string;
}

// ============================================
// SESSION/STORAGE TYPES
// ============================================

/**
 * Auth session stored in database (token whitelist)
 */
export interface AuthSession {
  _id?: string;
  uid: string;
  token: string;
  userAgent?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Payload for creating a new auth session
 */
export interface CreateAuthSessionPayload {
  uid: string;
  token: string;
  userAgent?: string;
}
