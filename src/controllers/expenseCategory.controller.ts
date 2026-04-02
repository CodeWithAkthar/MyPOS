import mongoose from "mongoose";
import { RequestWithUser } from "../types/utils";
import Utils from "../utils";
import ExpenseCategoryModel from "../models/expenseCategory";
import BrandModel from "../models/brand";
import ExpenseModel from "../models/expense";

const utils = new Utils();

export const createExpenseCategory = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  const { name, brandId } = req.body as any;
  if (!name) throw utils.createError(400, "name is required");
  if (!brandId) throw utils.createError(400, "brandId is required");
  if (!mongoose.Types.ObjectId.isValid(brandId)) throw utils.createError(400, "Invalid brand id");

  const brand = await BrandModel.findOne({ _id: brandId, companyId: req.user.companyId });
  if (!brand) throw utils.createError(404, "Brand not found in your company");

  const companyId = new mongoose.Types.ObjectId(req.user.companyId);
  const exists = await ExpenseCategoryModel.findOne({ name, companyId, brandId });
  if (exists) throw utils.createError(400, "Category already exists");

  const created = await ExpenseCategoryModel.create({ name, companyId, brandId });
  return await ExpenseCategoryModel.findById(created._id).populate("companyId").populate("brandId");
};

export const listExpenseCategories = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  const companyId = new mongoose.Types.ObjectId(req.user.companyId);
  const { brandId } = req.query as any;
  const filter: any = { companyId };
  if (brandId) {
    if (!mongoose.Types.ObjectId.isValid(brandId)) throw utils.createError(400, "Invalid brand id");
    filter.brandId = brandId;
  }
  return await ExpenseCategoryModel.find(filter).populate("companyId").populate("brandId");
};

export const updateExpenseCategory = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  const { id } = req.params as any;
  const { name, isActive, brandId } = req.body as any;
  if (!mongoose.Types.ObjectId.isValid(id)) throw utils.createError(400, "Invalid category id");

  const updateSet: any = { ...(name ? { name } : {}), ...(isActive !== undefined ? { isActive } : {}) };
  if (brandId) {
    if (!mongoose.Types.ObjectId.isValid(brandId)) throw utils.createError(400, "Invalid brand id");
    const brand = await BrandModel.findOne({ _id: brandId, companyId: req.user.companyId });
    if (!brand) throw utils.createError(404, "Brand not found in your company");
    updateSet.brandId = brandId;
  }

  const updated = await ExpenseCategoryModel.findOneAndUpdate(
    { _id: id, companyId: req.user.companyId },
    { $set: updateSet },
    { new: true },
  );
  if (!updated) throw utils.createError(404, "Category not found");
  return await ExpenseCategoryModel.findById(updated._id).populate("companyId").populate("brandId");
};

export const deleteExpenseCategory = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  const { id } = req.params as any;
  if (!mongoose.Types.ObjectId.isValid(id)) throw utils.createError(400, "Invalid category id");

  // Prevent deletion if any expense uses this category
  const expenseUsing = await ExpenseModel.findOne({ categoryId: id, companyId: req.user.companyId });
  if (expenseUsing) throw utils.createError(400, "Cannot delete category with existing expenses");

  const deleted = await ExpenseCategoryModel.findOneAndDelete({ _id: id, companyId: req.user.companyId });
  if (!deleted) throw utils.createError(404, "Category not found");
  return { message: "Category deleted successfully" };
};
