import { Response, NextFunction, Request } from "express";
import { User, UserRole } from "../types/user";
import { RequestWithUser } from "../types/utils";
import jwt from "../services/jwt.service";
import UserModel from "../models/user";
import mongoose from "mongoose";
import { userDataCatch, blockedCompanies, blockedBrands, blockedOutlets } from "../utils/catch.db";

import Utils from "../utils";

const utils = new Utils();

export const roleAccess = (...role: UserRole[]) => {
  return (reqE: Request, res: Response, next: NextFunction) => {
    const req: RequestWithUser = reqE as any;

    if (!role.includes(req.user?.role as UserRole)) {
      throw next(utils.createError(403, "You don't have permission for accessing this route"));
    }

    next();
  };
};

export const mustLogin = (reqE: Request, res: Response, next: NextFunction) => {
  const req: RequestWithUser = reqE as any;
  if (!req.user?._id) throw next(utils.createError(403, "UnAuthorized access"));
  next();
};

// This will not prevent users form accessing route
export const addUserWithJwtToRequest = async (reqE: Request, res: Response, next: NextFunction) => {
  try {
    const token = reqE.headers?.authorization?.split(" ")?.[1] || reqE?.cookies?.token;

    if (!token) return next();

    let payload;

    try {
      payload = jwt.verifyJwt(token);
    } catch (error) {
      return next(utils.createError(400, "Invalid token", error as any));
    }

    const req: RequestWithUser = reqE as any;

    if (payload) {
      const catchKey = `USER_${payload?.uid}`;
      let userData = userDataCatch.get(catchKey);

      // Fetch user data if not cached
      if (!userData) {
        userData = (await UserModel.findOne({ _id: new mongoose.Types.ObjectId(payload?.uid) }))?.toJSON() || undefined;

        if (!userData) return next();

        // Cache the user data for subsequent requests
        userDataCatch.set(catchKey, userData as User);
      }

      // Check blocklist for inactive entities (no DB queries!)
      // These blocklists are populated when companies/brands/outlets are marked inactive

      if (userData.companyId && blockedCompanies.has(userData.companyId)) {
        throw utils.createError(403, "Company is inactive. Please contact support.");
      }

      if (userData.brandId && blockedBrands.has(userData.brandId)) {
        throw utils.createError(403, "Brand is inactive. Please contact support.");
      }

      if (userData.outletId && blockedOutlets.has(userData.outletId)) {
        throw utils.createError(403, "Outlet is inactive. Please contact support.");
      }

      req.user = userData;
    }
    next();
  } catch (error) {
    next(error);
  }
};
