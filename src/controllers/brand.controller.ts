import { Response, Request } from "express";
import BrandModel from "../models/brand";
import CompanyModel from "../models/company";
import { RequestWithUser } from "../types/utils";
import { UserRole } from "../types/user";
import { ActiveStatus } from "../types/brand";
import { isValidActiveStatus } from "../utils/validators";
import mongoose from "mongoose";
import { getPaginationParams, buildPagedResponse } from "../utils/pagination";
import Utils from "../utils";

const utils = new Utils();

export const createBrand = async (req: RequestWithUser, res: Response) => {
  const { name, status } = req.body;

  if (!name) throw utils.createError(400, "Brand name is required");

  // Check if user is admin
  if (req.user.role !== UserRole.ADMIN) {
    throw utils.createError(403, "Only admin users can create brands");
  }

  // Check if user has a company
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company to create brands");
  }

  // Verify company exists
  const company = await CompanyModel.findById(req.user.companyId);
  if (!company) {
    throw utils.createError(404, "Company not found");
  }

  // Create the brand
  const brand = await BrandModel.create({
    name,
    status: status || ActiveStatus.ACTIVE,
    companyId: req.user.companyId,
  });

  return {
    message: "Brand created successfully",
    brand: {
      _id: brand._id,
      name: brand.name,
      status: brand.status,
      companyId: brand.companyId,
      createdAt: brand.createdAt,
      updatedAt: brand.updatedAt,
    },
  };
};

export const getBrands = async (req: RequestWithUser, res: Response) => {
  // Check if user has a company
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company to view brands");
  }

  const filter: any = { companyId: req.user.companyId };
  // Non-admins only see active brands
  if (req.user.role !== UserRole.ADMIN) {
    filter.status = ActiveStatus.ACTIVE;
  }

  const { page, limit, skip } = getPaginationParams(req as any);
  const allowAllResponse = ((req.query as any).allowAllResponse + "").toLowerCase() === "true";
  const total = await BrandModel.countDocuments(filter);
  const baseQuery = BrandModel.find(filter).sort({ name: 1 }).populate("companyId", "name");
  const brands = allowAllResponse ? await baseQuery : await baseQuery.skip(skip).limit(limit);

  const data = brands.map((brand) => ({
    _id: brand._id,
    name: brand.name,
    status: brand.status,
    companyId: brand.companyId,
    company: (brand.companyId as any)?.name ? { _id: (brand.companyId as any)._id, name: (brand.companyId as any).name } : null,
    createdAt: brand.createdAt,
    updatedAt: brand.updatedAt,
  }));
  return buildPagedResponse(data, allowAllResponse ? 1 : page, allowAllResponse ? total : limit, total);
};

export const getBrandById = async (req: RequestWithUser, res: Response) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw utils.createError(400, "Invalid brand ID");
  }

  // Check if user has a company
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company to view brands");
  }

  const brand = await BrandModel.findOne({
    _id: id,
    companyId: req.user.companyId,
  }).populate("companyId", "name");

  if (!brand) {
    throw utils.createError(404, "Brand not found");
  }

  // Non-admins cannot access inactive brands
  if (req.user.role !== UserRole.ADMIN && brand.status !== ActiveStatus.ACTIVE) {
    throw utils.createError(404, "Brand not found");
  }

  return {
    brand: {
      _id: brand._id,
      name: brand.name,
      status: brand.status,
      companyId: brand.companyId,
      company: (brand.companyId as any)?.name ? { _id: (brand.companyId as any)._id, name: (brand.companyId as any).name } : null,
      createdAt: brand.createdAt,
      updatedAt: brand.updatedAt,
    },
  };
};

export const updateBrand = async (req: RequestWithUser, res: Response) => {
  const { id } = req.params;
  const { name, status } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw utils.createError(400, "Invalid brand ID");
  }

  // Check if user is admin
  if (req.user.role !== UserRole.ADMIN) {
    throw utils.createError(403, "Only admin users can update brands");
  }

  // Check if user has a company
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company to update brands");
  }

  const updateData: any = {};
  if (name) updateData.name = name;
  if (status) {
    if (!isValidActiveStatus(status)) throw utils.createError(400, "Invalid status value");
    updateData.status = status;
  }

  const brand = await BrandModel.findOneAndUpdate({ _id: id, companyId: req.user.companyId }, updateData, { new: true }).populate(
    "companyId",
    "name",
  );

  if (!brand) {
    throw utils.createError(404, "Brand not found");
  }

  return {
    message: "Brand updated successfully",
    brand: {
      _id: brand._id,
      name: brand.name,
      status: brand.status,
      companyId: brand.companyId,
      company: (brand.companyId as any)?.name ? { _id: (brand.companyId as any)._id, name: (brand.companyId as any).name } : null,
      createdAt: brand.createdAt,
      updatedAt: brand.updatedAt,
    },
  };
};

export const deleteBrand = async (req: RequestWithUser, res: Response) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw utils.createError(400, "Invalid brand ID");
  }

  // Check if user is admin
  if (req.user.role !== UserRole.ADMIN) {
    throw utils.createError(403, "Only admin users can delete brands");
  }

  // Check if user has a company
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company to delete brands");
  }

  const brand = await BrandModel.findOneAndDelete({
    _id: id,
    companyId: req.user.companyId,
  });

  if (!brand) {
    throw utils.createError(404, "Brand not found");
  }

  return {
    message: "Brand deleted successfully",
  };
};
