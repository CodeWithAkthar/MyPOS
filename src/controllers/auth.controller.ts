import { Response, Request } from "express";
import { RequestWithUser } from "../types/utils";
import authService from "../services/auth.service";
import { SignInRequest } from "../types/auth.types";

// ============================================
// AUTH CONTROLLER
// ============================================

/**
 * Sign in user
 * POST /auth/signin
 */
export const signInUser = async (req: Request, res: Response) => {
  const credentials: SignInRequest = req.body;
  const userAgent = req.headers["user-agent"];

  const result = await authService.signIn(credentials, userAgent, req.requestId);

  // Set auth cookie
  const currentDate = new Date();
  const next12months = new Date(currentDate.setMonth(currentDate.getMonth() + 12));

  res.cookie("token", result.jwtToken, {
    httpOnly: true,
    secure: true,
    expires: next12months,
    sameSite: "none",
  });

  return result;
};

/**
 * Logout user
 * POST /auth/logout
 */
export const logoutUser = async (req: RequestWithUser, res: Response) => {
  const token = req.headers?.authorization?.split(" ")?.[1] || req.cookies.token;

  const result = await authService.logout(token, req.requestId);

  // Clear auth cookie
  res.clearCookie("token");

  return result;
};
