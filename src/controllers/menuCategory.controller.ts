import { Response } from "express";
import mongoose from "mongoose";
import { RequestWithUser } from "../types/utils";
import { ActiveStatus } from "../types/brand";
import Utils from "../utils";
import OutletsModel from "../models/outlets";
import MenuCategoryModel from "../models/menuCategory";
import { getPaginationParams, buildPagedResponse } from "../utils/pagination";

const utils = new Utils();

function assertValidObjectId(id: string, name: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw utils.createError(400, `Invalid ${name}`);
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function inferIdsFromOutletOrThrow(companyId: string, outletId: string) {
  const outlet = await OutletsModel.findOne({ _id: outletId, companyId });
  if (!outlet) throw utils.createError(404, "Outlet not found in your company");
  return { brandId: outlet.brandId + "", companyId, outletId };
}

export const listCategories = async (req: RequestWithUser, res: Response) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  const { outletId } = req.query as any;
  if (!outletId) throw utils.createError(400, "outletId is required");
  assertValidObjectId(outletId, "outlet id");

  const { brandId, companyId } = await inferIdsFromOutletOrThrow(req.user.companyId as string, outletId);

  const { isActive } = req.query as any;
  if (isActive !== undefined && ![ActiveStatus.ACTIVE, ActiveStatus.INACTIVE].includes(isActive)) {
    throw utils.createError(400, "Invalid isActive filter");
  }

  const filter: any = { companyId, brandId, outletId };
  if (isActive) filter.isActive = isActive;

  const { page, limit, skip } = getPaginationParams(req as any);
  const allowAllResponse = ((req.query as any).allowAllResponse + "").toLowerCase() === "true";

  const sort = { displayOrder: 1, name: 1 } as const;
  const total = await MenuCategoryModel.countDocuments(filter);
  const query = MenuCategoryModel.find(filter)
    .sort(sort)
    .populate("companyId", "name")
    .populate("brandId", "name")
    .populate("outletId", "name logo");

  const categories = allowAllResponse ? await query : await query.skip(skip).limit(limit);

  return buildPagedResponse(categories, allowAllResponse ? 1 : page, allowAllResponse ? total : limit, total);
};

export const createCategory = async (req: RequestWithUser, res: Response) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  const { name, displayOrder, outletId, isActive } = req.body as any;
  if (!name) throw utils.createError(400, "name is required");
  if (displayOrder !== undefined && typeof displayOrder !== "number") throw utils.createError(400, "displayOrder must be a number");
  if (!outletId) throw utils.createError(400, "outletId is required");
  assertValidObjectId(outletId, "outlet id");
  if (isActive !== undefined && ![ActiveStatus.ACTIVE, ActiveStatus.INACTIVE].includes(isActive)) {
    throw utils.createError(400, "Invalid isActive value");
  }

  const { brandId, companyId } = await inferIdsFromOutletOrThrow(req.user.companyId as string, outletId);

  // Prevent duplicate category names within the same outlet (case-insensitive)
  const existing = await MenuCategoryModel.findOne({
    companyId,
    brandId,
    outletId,
    name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
  });
  if (existing) throw utils.createError(400, "Category with this name already exists in this outlet");

  // Shift existing categories if inserting in between
  if (displayOrder !== undefined) {
    await MenuCategoryModel.updateMany(
      {
        companyId,
        brandId,
        outletId,
        displayOrder: { $gte: displayOrder },
      },
      { $inc: { displayOrder: 1 } },
    );
  }

  const created = await MenuCategoryModel.create({
    name,
    displayOrder: displayOrder || 0,
    isActive: isActive || ActiveStatus.ACTIVE,
    companyId,
    brandId,
    outletId,
  });
  const populated = await MenuCategoryModel.findById(created._id)
    .populate("companyId", "name")
    .populate("brandId", "name")
    .populate("outletId", "name logo");
  return { message: "Category created successfully", category: populated };
};

export const updateCategory = async (req: RequestWithUser, res: Response) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  const { id } = req.params;
  assertValidObjectId(id, "category id");

  const { name, displayOrder, outletId, isActive } = req.body as any;
  if (displayOrder !== undefined && typeof displayOrder !== "number") throw utils.createError(400, "displayOrder must be a number");
  if (!outletId) throw utils.createError(400, "outletId is required");
  assertValidObjectId(outletId, "outlet id");
  if (isActive !== undefined && ![ActiveStatus.ACTIVE, ActiveStatus.INACTIVE].includes(isActive)) {
    throw utils.createError(400, "Invalid isActive value");
  }

  const { brandId, companyId } = await inferIdsFromOutletOrThrow(req.user.companyId as string, outletId);

  // Find category
  const category = await MenuCategoryModel.findOne({ _id: id, companyId, brandId, outletId });
  if (!category) throw utils.createError(404, "Category not found");

  const update: any = {};
  if (name) update.name = name;
  if (isActive !== undefined) update.isActive = isActive;

  // Prevent duplicate category names within the same outlet on update (case-insensitive)
  if (name) {
    const duplicate = await MenuCategoryModel.findOne({
      _id: { $ne: new mongoose.Types.ObjectId(id) },
      companyId,
      brandId,
      outletId,
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
    });
    if (duplicate) throw utils.createError(400, "Category with this name already exists in this outlet");
  }

  // Handle display order change
  if (displayOrder !== undefined && displayOrder !== category.displayOrder) {
    const oldOrder = category.displayOrder;
    const newOrder = displayOrder;

    if (newOrder < oldOrder) {
      // Moving UP: Shift items in [newOrder, oldOrder-1] DOWN (+1)
      await MenuCategoryModel.updateMany(
        {
          companyId,
          brandId,
          outletId,
          displayOrder: { $gte: newOrder, $lt: oldOrder },
        },
        { $inc: { displayOrder: 1 } },
      );
    } else if (newOrder > oldOrder) {
      // Moving DOWN: Shift items in [oldOrder+1, newOrder] UP (-1)
      await MenuCategoryModel.updateMany(
        {
          companyId,
          brandId,
          outletId,
          displayOrder: { $gt: oldOrder, $lte: newOrder },
        },
        { $inc: { displayOrder: -1 } },
      );
    }
    update.displayOrder = newOrder;
  }

  const updated = await MenuCategoryModel.findOneAndUpdate({ _id: id, companyId, brandId, outletId }, { $set: update }, { new: true })
    .populate("companyId", "name")
    .populate("brandId", "name")
    .populate("outletId", "name logo");
  if (!updated) throw utils.createError(404, "Category not found");
  return { message: "Category updated successfully", category: updated };
};

export const deleteCategory = async (req: RequestWithUser, res: Response) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  const { id } = req.params;
  assertValidObjectId(id, "category id");

  // outletId provided to ensure outlet scoping
  const { outletId } = req.query as any;
  if (!outletId) throw utils.createError(400, "outletId is required");
  assertValidObjectId(outletId, "outlet id");

  const { brandId, companyId } = await inferIdsFromOutletOrThrow(req.user.companyId as string, outletId);

  const deleted = await MenuCategoryModel.findOneAndDelete({ _id: id, companyId, brandId, outletId });
  if (!deleted) throw utils.createError(404, "Category not found");
  return { message: "Category deleted successfully" };
};

export const getCategoryById = async (req: RequestWithUser, res: Response) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  const { id } = req.params;
  const { outletId } = req.query as any;
  if (!outletId) throw utils.createError(400, "outletId is required");
  assertValidObjectId(outletId, "outlet id");
  assertValidObjectId(id, "category id");

  const { brandId, companyId } = await inferIdsFromOutletOrThrow(req.user.companyId as string, outletId);

  const category = await MenuCategoryModel.findOne({ _id: id, companyId, brandId, outletId })
    .populate("companyId", "name")
    .populate("brandId", "name")
    .populate("outletId", "name logo");
  if (!category) throw utils.createError(404, "Category not found");
  return { category };
};
