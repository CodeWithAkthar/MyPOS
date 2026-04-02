import { Response } from "express";
import mongoose from "mongoose";
import { RequestWithUser } from "../types/utils";
import { getPaginationParams, buildPagedResponse } from "../utils/pagination";
import { User, UserRole, isUserRole } from "../types/user";
import UserModel from "../models/user";
import BrandModel from "../models/brand";
import OutletsModel from "../models/outlets";
import Utils from "../utils";
import passwordService from "../services/password.service";

const utils = new Utils();

function assertValidObjectId(id: string, name: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw utils.createError(400, `Invalid ${name}`);
}

async function ensureBrandAndOutletUnderCompany(companyId: string, brandId: string, outletId: string) {
  const brand = await BrandModel.findOne({ _id: brandId, companyId });
  if (!brand) throw utils.createError(404, "Branch not found in your company");

  const outlet = await OutletsModel.findOne({ _id: outletId, companyId });
  if (!outlet) throw utils.createError(404, "Location not found in your company");

  if (outlet.brandId + "" !== brand._id + "") {
    throw utils.createError(400, "Location does not belong to the provided branch");
  }
}

export const createEmployee = async (req: RequestWithUser) => {
  const { outletId, name, userRole, username, password } = req.body as any;

  if (!outletId) throw utils.createError(400, "location is required");
  if (!name) throw utils.createError(400, "name is required");
  if (!username) throw utils.createError(400, "username is required");
  if (!password) throw utils.createError(400, "password is required");

  assertValidObjectId(outletId, "outlet id");

  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  if (req.user.role !== UserRole.ADMIN) throw utils.createError(403, "Only admin can create employees");

  // Infer brandId from outlet and validate both under company
  const outlet = await OutletsModel.findOne({ _id: outletId, companyId: req.user.companyId });
  if (!outlet) throw utils.createError(404, "Location not found in your company");
  const brandId = outlet.brandId + "";
  await ensureBrandAndOutletUnderCompany(req.user.companyId as string, brandId, outletId);

  const normalizedRole = (userRole + "").toLowerCase();
  if (!isUserRole(normalizedRole)) throw utils.createError(400, "Invalid userRole");
  if (normalizedRole === UserRole.ADMIN) throw utils.createError(400, "Cannot assign admin role");

  const companyId = new mongoose.Types.ObjectId(req.user.companyId);

  // Validate and format username
  const formattedUsername = utils.validateAndFormatUsername(username);
  
  // Check username uniqueness within company
  const existing = await UserModel.findOne({ username: formattedUsername, companyId });
  if (existing) throw utils.createError(400, "User with this username already exists in your company");

  const newUser = await UserModel.create({
    name,
    username: formattedUsername,
    password: passwordService.createHash(password),
    role: normalizedRole,
    companyId,
    brandId,
    outletId,
  });

  return {
    _id: newUser._id,
    name: newUser.name,
    username: newUser.username,
    role: newUser.role,
    brandId: newUser.brandId,
    outletId: newUser.outletId,
    companyId: newUser.companyId,
  } as Partial<User>;
};

export const listEmployees = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  const companyId = new mongoose.Types.ObjectId(req.user.companyId);
  const roleFilter = req.query.role as string | undefined;

  const filter: any = { companyId, role: { $ne: UserRole.ADMIN } };
  if (roleFilter) filter.role = roleFilter;

  const { page, limit, skip } = getPaginationParams(req as any);
  const allowAllResponse = ((req.query as any).allowAllResponse + "").toLowerCase() === "true";
  const total = await UserModel.countDocuments(filter);
  const baseQuery = UserModel.find(filter, { password: 0 })
    .populate("brandId")
    .populate({ path: "outletId", populate: { path: "brandId" } })
    .populate("companyId");
  const employees = allowAllResponse ? await baseQuery : await baseQuery.skip(skip).limit(limit);
  return buildPagedResponse(employees, allowAllResponse ? 1 : page, allowAllResponse ? total : limit, total);
};

export const getEmployeeById = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  const id = req.params.id;
  assertValidObjectId(id, "employee id");

  const user = await UserModel.findOne({ _id: id, companyId: req.user.companyId }, { password: 0 })
    .populate("brandId")
    .populate({ path: "outletId", populate: { path: "brandId" } })
    .populate("companyId");
  if (!user) throw utils.createError(404, "Employee not found");
  return user;
};

export const updateEmployee = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  if (req.user.role !== UserRole.ADMIN) throw utils.createError(403, "Only admin can update employees");

  const id = req.params.id;
  assertValidObjectId(id, "employee id");

  const { brandId, outletId, name, userRole, username, password } = req.body as any;

  const updateData: any = {};
  if (name) updateData.name = name;
  if (userRole) {
    const normalizedRole = (userRole + "").toLowerCase();
    if (!isUserRole(normalizedRole)) throw utils.createError(400, "Invalid userRole");
    if (normalizedRole === UserRole.ADMIN) throw utils.createError(400, "Cannot assign admin role");
    updateData.role = normalizedRole;
  }

  if (brandId || outletId) {
    if (!brandId || !outletId) throw utils.createError(400, "Both branch and location must be provided together");
    assertValidObjectId(brandId, "branch id");
    assertValidObjectId(outletId, "location id");
    await ensureBrandAndOutletUnderCompany(req.user.companyId as string, brandId, outletId);
    updateData.brandId = brandId;
    updateData.outletId = outletId;
  }

  // Handle username update
  if (username) {
    const formattedUsername = utils.validateAndFormatUsername(username);

    // Check if new username already exists in company (excluding current user)
    const existingUser = await UserModel.findOne({
      username: formattedUsername,
      companyId: req.user.companyId,
      _id: { $ne: new mongoose.Types.ObjectId(id) },
    });

    if (existingUser) {
      throw utils.createError(400, "User with this username already exists in your company");
    }

    updateData.username = formattedUsername;
  }

  // Handle password update
  if (password) {
    if (typeof password !== "string" || password.length < 1) {
      throw utils.createError(400, "Password must be a non-empty string");
    }
    updateData.password = passwordService.createHash(password);
  }

  // Immutable fields - prevent direct updates to companyId
  delete (updateData as any).companyId;

  const updated = await UserModel.findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(id), companyId: new mongoose.Types.ObjectId(req.user.companyId) },
    { $set: updateData },
    { new: true, projection: { password: 0 } },
  )
    .populate("brandId")
    .populate({ path: "outletId", populate: { path: "brandId" } })
    .populate("companyId");

  if (!updated) throw utils.createError(404, "Employee not found");
  return updated;
};

export const deleteEmployee = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  if (req.user.role !== UserRole.ADMIN) throw utils.createError(403, "Only admin can delete employees");

  const id = req.params.id;
  assertValidObjectId(id, "employee id");

  const deleted = await UserModel.findOneAndDelete({ _id: id, companyId: req.user.companyId, role: { $ne: UserRole.ADMIN } });
  if (!deleted) throw utils.createError(404, "Employee not found");
  return { message: "Employee deleted successfully" };
};
