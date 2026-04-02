import { Response } from "express";
import mongoose from "mongoose";
import { RequestWithUser } from "../types/utils";
import Utils from "../utils";
import OutletsModel from "../models/outlets";
import MenuItemModel from "../models/menuItem";
import MenuCategoryModel from "../models/menuCategory";
import { ActiveStatus } from "../types/brand";
import { isValidActiveStatus } from "../utils/validators";
import { getPaginationParams, buildPagedResponse } from "../utils/pagination";

const utils = new Utils();

function assertValidObjectId(id: string, name: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw utils.createError(400, `Invalid ${name}`);
}

async function inferIdsFromOutletOrThrow(companyId: string, outletId: string) {
  const outlet = await OutletsModel.findOne({ _id: outletId, companyId });
  if (!outlet) throw utils.createError(404, "Outlet not found in your company");
  return { brandId: outlet.brandId + "", companyId, outletId };
}

/**
 * Handles display order shifting when inserting/updating menu items
 * Shifts all items at or after the new position up by 1
 */
async function handleDisplayOrderShift(
  companyId: string,
  brandId: string,
  outletId: string,
  categoryId: string,
  newOrder: number,
  currentItemId?: string,
) {
  const filter: any = {
    companyId,
    brandId,
    outletId,
    categoryId,
    displayOrder: { $gte: newOrder },
  };

  // Exclude the current item if updating
  if (currentItemId) {
    filter._id = { $ne: currentItemId };
  }

  // Increment displayOrder for all items at or after the new position
  await MenuItemModel.updateMany(filter, { $inc: { displayOrder: 1 } });
}

export const listMenuItems = async (req: RequestWithUser, res: Response) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  const { outletId, categoryId, isActive } = req.query as any;
  if (!outletId) throw utils.createError(400, "outletId is required");
  assertValidObjectId(outletId, "outlet id");
  if (categoryId) assertValidObjectId(categoryId, "category id");
  if (isActive && !isValidActiveStatus(isActive)) throw utils.createError(400, "Invalid isActive value");

  const { brandId, companyId } = await inferIdsFromOutletOrThrow(req.user.companyId as string, outletId);

  const filter: any = { companyId, brandId, outletId };
  if (categoryId) filter.categoryId = categoryId;
  if (isActive) filter.isActive = isActive;

  const { page, limit, skip } = getPaginationParams(req as any);
  const allowAllResponse = ((req.query as any).allowAllResponse + "").toLowerCase() === "true";

  const sort = { displayOrder: 1, name: 1 } as const;
  const total = await MenuItemModel.countDocuments(filter);

  const query = MenuItemModel.find(filter)
    .sort(sort)
    .populate("companyId", "name")
    .populate("brandId", "name")
    .populate("outletId", "name logo")
    .populate("categoryId", "name displayOrder")
    .populate("createdBy", "name username role");

  const items = allowAllResponse ? await query : await query.skip(skip).limit(limit);

  return buildPagedResponse(items, allowAllResponse ? 1 : page, allowAllResponse ? total : limit, total);
};

export const createMenuItem = async (req: RequestWithUser, res: Response) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  const { outletId, categoryId, name, description, imageURL, price, displayOrder, isActive } = req.body as any;
  if (!outletId) throw utils.createError(400, "outletId is required");
  assertValidObjectId(outletId, "outlet id");
  if (!categoryId) throw utils.createError(400, "categoryId is required");
  assertValidObjectId(categoryId, "category id");
  if (!name) throw utils.createError(400, "name is required");
  if (price === undefined || typeof price !== "number" || price < 0) throw utils.createError(400, "price must be a non-negative number");
  if (isActive && !isValidActiveStatus(isActive)) throw utils.createError(400, "Invalid isActive value");

  const { brandId, companyId } = await inferIdsFromOutletOrThrow(req.user.companyId as string, outletId);

  const category = await MenuCategoryModel.findOne({ _id: categoryId, companyId, brandId, outletId });
  if (!category) throw utils.createError(404, "Category not found in this outlet");

  const finalDisplayOrder = displayOrder ?? 0;

  // Shift existing items if displayOrder is specified
  if (displayOrder !== undefined) {
    await handleDisplayOrderShift(companyId, brandId, outletId, categoryId, finalDisplayOrder);
  }

  const created = await MenuItemModel.create({
    companyId,
    brandId,
    outletId,
    categoryId,
    name,
    description,
    imageURL,
    price,
    displayOrder: finalDisplayOrder,
    isActive: isActive || ActiveStatus.ACTIVE,
    createdBy: req.user._id,
  });
  const populated = await MenuItemModel.findById(created._id)
    .populate("companyId", "name")
    .populate("brandId", "name")
    .populate("outletId", "name logo")
    .populate("categoryId", "name displayOrder")
    .populate("createdBy", "name username role");
  return { message: "Menu item created successfully", item: populated };
};

export const updateMenuItem = async (req: RequestWithUser, res: Response) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  const { id } = req.params;
  assertValidObjectId(id, "menu item id");
  const { outletId, categoryId, name, description, imageURL, price, displayOrder, isActive } = req.body as any;
  if (!outletId) throw utils.createError(400, "outletId is required");
  assertValidObjectId(outletId, "outlet id");
  if (categoryId) assertValidObjectId(categoryId, "category id");
  if (price !== undefined && (typeof price !== "number" || price < 0)) throw utils.createError(400, "price must be a non-negative number");
  if (isActive && !isValidActiveStatus(isActive)) throw utils.createError(400, "Invalid isActive value");

  const { brandId, companyId } = await inferIdsFromOutletOrThrow(req.user.companyId as string, outletId);

  // Get the current item first to check if displayOrder is changing
  const currentItem = await MenuItemModel.findOne({ _id: id, companyId, brandId, outletId });
  if (!currentItem) throw utils.createError(404, "Menu item not found");

  const update: any = {};
  if (name) update.name = name;
  if (description !== undefined) update.description = description;
  if (imageURL !== undefined) update.imageURL = imageURL;
  if (price !== undefined) update.price = price;
  if (isActive) update.isActive = isActive;

  // Handle category change
  const effectiveCategoryId = categoryId || currentItem.categoryId.toString();
  if (categoryId) {
    const category = await MenuCategoryModel.findOne({ _id: categoryId, companyId, brandId, outletId });
    if (!category) throw utils.createError(404, "Category not found in this outlet");
    update.categoryId = categoryId;
  }

  // Handle display order change
  if (displayOrder !== undefined && displayOrder !== currentItem.displayOrder) {
    const oldOrder = currentItem.displayOrder || 0;
    const newOrder = displayOrder;

    if (newOrder < oldOrder) {
      // Moving to a lower position (e.g., 10 → 3)
      // Shift items at positions [newOrder, oldOrder) up by 1
      await MenuItemModel.updateMany(
        {
          companyId,
          brandId,
          outletId,
          categoryId: effectiveCategoryId,
          displayOrder: { $gte: newOrder, $lt: oldOrder },
          _id: { $ne: id },
        },
        { $inc: { displayOrder: 1 } },
      );
    } else {
      // Moving to a higher position (e.g., 3 → 10)
      // Shift items at positions (oldOrder, newOrder] down by 1
      await MenuItemModel.updateMany(
        {
          companyId,
          brandId,
          outletId,
          categoryId: effectiveCategoryId,
          displayOrder: { $gt: oldOrder, $lte: newOrder },
          _id: { $ne: id },
        },
        { $inc: { displayOrder: -1 } },
      );
    }

    update.displayOrder = displayOrder;
  }

  const updated = await MenuItemModel.findOneAndUpdate({ _id: id, companyId, brandId, outletId }, { $set: update }, { new: true })
    .populate("companyId", "name")
    .populate("brandId", "name")
    .populate("outletId", "name logo")
    .populate("categoryId", "name displayOrder")
    .populate("createdBy", "name username role");
  if (!updated) throw utils.createError(404, "Menu item not found");
  return { message: "Menu item updated successfully", item: updated };
};

export const deleteMenuItem = async (req: RequestWithUser, res: Response) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  const { id } = req.params;
  assertValidObjectId(id, "menu item id");
  const { outletId } = req.query as any;
  if (!outletId) throw utils.createError(400, "outletId is required");
  assertValidObjectId(outletId, "outlet id");

  const { brandId, companyId } = await inferIdsFromOutletOrThrow(req.user.companyId as string, outletId);

  const deleted = await MenuItemModel.findOneAndDelete({ _id: id, companyId, brandId, outletId });
  if (!deleted) throw utils.createError(404, "Menu item not found");
  return { message: "Menu item deleted successfully" };
};

export const getMenuItemById = async (req: RequestWithUser, res: Response) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  const { id } = req.params;
  const { outletId } = req.query as any;
  if (!outletId) throw utils.createError(400, "outletId is required");
  assertValidObjectId(outletId, "outlet id");
  assertValidObjectId(id, "menu item id");

  const { brandId, companyId } = await inferIdsFromOutletOrThrow(req.user.companyId as string, outletId);

  const item = await MenuItemModel.findOne({ _id: id, companyId, brandId, outletId })
    .sort({ displayOrder: 1, name: 1 })
    .populate("companyId", "name")
    .populate("brandId", "name")
    .populate("outletId", "name logo")
    .populate("categoryId", "name displayOrder")
    .populate("createdBy", "name username role");
  if (!item) throw utils.createError(404, "Menu item not found");
  return { item };
};
