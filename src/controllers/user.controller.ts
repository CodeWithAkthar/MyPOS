import { isUserRole, User, UserRole } from "../types/user";
import { RequestWithUser } from "../types/utils";
import passwordService from "../services/password.service";
import UserModel from "../models/user";
import mongoose from "mongoose";
import { getPaginationParams, buildPagedResponse } from "../utils/pagination";
import BrandModel from "../models/brand";
import OutletsModel from "../models/outlets";
import { ActiveStatus } from "../types/brand";
import Utils from "../utils";
import { createCompanyInternal } from "./company.controller";

const utils = new Utils();

// TODO: Remove/make it protected.
// CRITICAL controller
export const addAdminUser = async (req: RequestWithUser) => {
  const { username, password, companyName }: Partial<User> & { companyName: string } = req.body;

  if (!username || !password || !companyName) throw utils.createError(400, "Invalid request");

  // Create user
  const hashedPassword = passwordService.createHash(password!);
  const user = await UserModel.create({ username, password: hashedPassword, role: UserRole.ADMIN });

  // Create company
  const company = await createCompanyInternal({ name: companyName }, user._id as string);

  // Update user with company id
  await UserModel.findByIdAndUpdate(user._id, { companyId: company._id });

  return {
    message: "Admin user created successfully",
    user: {
      _id: user._id,
      username: user.username,
      role: user.role,
      companyId: user.companyId,
    },
    company: {
      _id: company._id,
      name: company.name,
      companyCode: company.companyCode,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    },
  };
}

// Add validations
export const addUser = async (req: RequestWithUser) => {
  const data: User = req.body;
  const companyId = new mongoose.Types.ObjectId(req.user.companyId);

  // Validate and format username
  data.username = utils.validateAndFormatUsername(data.username as string);

  // Check username uniqueness within company
  const existingUserData = await UserModel.findOne({ username: data.username, companyId });
  if (existingUserData) throw utils.createError(400, "User with this username already exists in your company");

  if (!isUserRole(data.role as string)) throw utils.createError(400, "Invalid role");
  if (data.role == UserRole.ADMIN) throw utils.createError(400, "You cannot add another admin");

  // For employee roles (waiter/cashier), outletId is required; brandId inferred from outlet
  const isEmployee = data.role === UserRole.WAITER || data.role === UserRole.CASHIER;
  if (isEmployee) {
    if (!data.outletId) throw utils.createError(400, "outletId is required for employee users");

    const outlet = await OutletsModel.findOne({ _id: new mongoose.Types.ObjectId(data.outletId), companyId });
    if (!outlet) throw utils.createError(400, "Invalid outletId");

    // Optionally verify brand exists and is active
    const brand = await BrandModel.findOne({ _id: new mongoose.Types.ObjectId(outlet.brandId as any), companyId });
    if (!brand) throw utils.createError(400, "Invalid derived brand from outlet");

    // Enforce active status for employee assignments
    if (brand.status !== ActiveStatus.ACTIVE) throw utils.createError(400, "Cannot assign user to inactive brand");
    if (outlet.status !== ActiveStatus.ACTIVE) throw utils.createError(400, "Cannot assign user to inactive outlet");

    // Infer brandId from outlet
    (data as any).brandId = outlet.brandId as any;
  } else {
    // Clear employee-only fields for non-employee roles
    delete (data as any).brandId;
    delete (data as any).outletId;
  }

  data.password = passwordService.createHash(data.password as string);

  const newData = await new UserModel({ ...data, companyId }).save();
  const created = await UserModel.findById(newData._id)
    .select({ password: 0 })
    .populate("brandId")
    .populate({ path: "outletId", populate: { path: "brandId" } })
    .populate("companyId");
  return created;
};

// Add validations
export const updateUser = async (req: RequestWithUser) => {
  const data: User = req.body;
  const idToUpdate = req.params.userId;
  const companyId = new mongoose.Types.ObjectId(req.user.companyId);

  if (data.role) {
    if (data.role == UserRole.ADMIN) throw utils.createError(403, "You cannot add another admin");
    if (!isUserRole(data.role as string)) throw utils.createError(400, "Invalid role");
  }

  // Only self or admin can update
  const isSelf = req.user._id + "" === idToUpdate + "";
  const isAdmin = req.user.role === UserRole.ADMIN;
  if (!isSelf && !isAdmin) throw utils.createError(403, "You don't have access to perform this action");

  // Admin can only update non-admin (i.e., employees)
  if (isAdmin) {
    const userToUpdate = await UserModel.findOne({ _id: new mongoose.Types.ObjectId(idToUpdate), companyId });
    if (!userToUpdate) throw utils.createError(404, "User not found");
    if (userToUpdate.role === UserRole.ADMIN) throw utils.createError(403, "Cannot update admin user");
  }

  // When role is employee, enforce outlet presence; infer brand from outlet
  const roleToValidate = data.role as string | undefined;
  const isEmployee = roleToValidate ? roleToValidate === UserRole.WAITER || roleToValidate === UserRole.CASHIER : undefined;
  if (isEmployee) {
    if (!data.outletId) throw utils.createError(400, "outletId is required for employee users");

    const outlet = await OutletsModel.findOne({ _id: new mongoose.Types.ObjectId(data.outletId), companyId });
    if (!outlet) throw utils.createError(400, "Invalid outletId");
    const brand = await BrandModel.findOne({ _id: new mongoose.Types.ObjectId(outlet.brandId as any), companyId });
    if (!brand) throw utils.createError(400, "Invalid derived brand from outlet");

    if (brand.status !== ActiveStatus.ACTIVE) throw utils.createError(400, "Cannot assign user to inactive brand");
    if (outlet.status !== ActiveStatus.ACTIVE) throw utils.createError(400, "Cannot assign user to inactive outlet");

    (data as any).brandId = outlet.brandId as any;
  } else if (roleToValidate && roleToValidate === UserRole.ADMIN) {
    // Strip employee-only fields if elevated to admin
    delete (data as any).brandId;
    delete (data as any).outletId;
  }

  // Handle username update
  if (data.username) {
    const formattedUsername = utils.validateAndFormatUsername(data.username as string);

    // Check if new username already exists in company (excluding current user)
    const existingUser = await UserModel.findOne({
      username: formattedUsername,
      companyId,
      _id: { $ne: new mongoose.Types.ObjectId(idToUpdate) },
    });

    if (existingUser) {
      throw utils.createError(400, "User with this username already exists in your company");
    }

    data.username = formattedUsername;
  }

  // Handle password update - only admin can update other user's password, or user updating their own
  if (data.password) {
    if (typeof data.password !== "string" || (data.password as string).length < 1) {
      throw utils.createError(400, "Password must be a non-empty string");
    }
    data.password = passwordService.createHash(data.password as string);
  }

  delete data._id;
  delete data.companyId;

  const updateUser = await UserModel.findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(idToUpdate), companyId },
    { $set: data },
    { new: true, projection: { password: 0 } },
  );

  if (!updateUser) throw utils.createError(400, "User not found");
  return await UserModel.findById(updateUser._id)
    .select({ password: 0 })
    .populate("brandId")
    .populate({ path: "outletId", populate: { path: "brandId" } })
    .populate("companyId");
};

// Add validations
export const getAllUsers = async (req: RequestWithUser) => {
  const companyId = new mongoose.Types.ObjectId(req.user.companyId);
  const role = req.query.role;

  const filter: any = {
    role: { $ne: UserRole.ADMIN },
  };

  if (role) filter.role = role + "";

  const { page, limit, skip } = getPaginationParams(req as any);
  const allowAllResponse = ((req.query as any).allowAllResponse + "").toLowerCase() === "true";
  const total = await UserModel.countDocuments({ companyId, ...filter });
  const baseQuery = UserModel.find({ companyId, ...filter }, { password: 0 })
    .populate("brandId")
    .populate({ path: "outletId", populate: { path: "brandId" } })
    .populate("companyId");
  const users = allowAllResponse ? await baseQuery : await baseQuery.skip(skip).limit(limit);
  return buildPagedResponse(users, allowAllResponse ? 1 : page, allowAllResponse ? total : limit, total);
};

export const getUserById = async (req: RequestWithUser) => {
  const companyId = new mongoose.Types.ObjectId(req.user.companyId);
  const userId = req.params.userId;
  return await UserModel.findOne({ _id: new mongoose.Types.ObjectId(userId), companyId }, { password: 0 })
    .populate("brandId")
    .populate({ path: "outletId", populate: { path: "brandId" } })
    .populate("companyId");
};

export const deleteUser = async (req: RequestWithUser) => {
  const companyId = new mongoose.Types.ObjectId(req.user.companyId);
  const userId = req.params.userId;
  // Prevent deleting admin users
  const user = await UserModel.findOne({ _id: new mongoose.Types.ObjectId(userId), companyId });
  if (!user) throw utils.createError(404, "User not found");
  if (user.role === UserRole.ADMIN) throw utils.createError(403, "Cannot delete admin user");
  const deleted = await UserModel.findOneAndDelete({ _id: new mongoose.Types.ObjectId(userId), companyId });
  if (!deleted) throw utils.createError(404, "User not found");
  const { password, ...dataToReturn } = deleted?.toJSON();
  return dataToReturn;
};
