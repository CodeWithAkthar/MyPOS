import { Response, Request } from "express";
import OutletsModel from "../models/outlets";
import BrandModel from "../models/brand";
import MenuCategoryModel from "../models/menuCategory";
import MenuItemModel from "../models/menuItem";
import { RequestWithUser } from "../types/utils";
import { UserRole } from "../types/user";
import { ActiveStatus } from "../types/brand";
import { isValidActiveStatus } from "../utils/validators";
import mongoose from "mongoose";
import { getPaginationParams, buildPagedResponse } from "../utils/pagination";
import Utils from "../utils";
import { createDefaultOrderTypesForOutlet } from "./orderType.controller";

const utils = new Utils();

export const createOutlet = async (req: RequestWithUser, res: Response) => {
  const { name, status, brandId, timeZone, address, phoneNumber, logo } = req.body;

  if (!name) throw utils.createError(400, "Outlet name is required");
  if (!brandId) throw utils.createError(400, "Brand ID is required");
  if (!timeZone) throw utils.createError(400, "Time zone is required");

  if (!mongoose.Types.ObjectId.isValid(brandId)) {
    throw utils.createError(400, "Invalid brand ID");
  }

  // Check if user is admin
  if (req.user.role !== UserRole.ADMIN) {
    throw utils.createError(403, "Only admin users can create outlets");
  }

  // Check if user has a company
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company to create outlets");
  }

  // Convert timezone from client format (e.g., "IST +05:30") to IANA format (e.g., "Asia/Kolkata")
  const ianaTimeZone = utils.convertToIANATimeZone(timeZone);

  // Verify brand exists and belongs to user's company
  const brand = await BrandModel.findOne({
    _id: brandId,
    companyId: req.user.companyId,
  });

  if (!brand) {
    throw utils.createError(404, "Brand not found or doesn't belong to your company");
  }

  // Prevent creating an active outlet under an inactive brand
  if (brand.status !== ActiveStatus.ACTIVE) {
    throw utils.createError(400, "Cannot create outlet under an inactive brand");
  }

  // Create the outlet
  const outlet = await OutletsModel.create({
    name,
    status: status || ActiveStatus.ACTIVE,
    brandId,
    companyId: req.user.companyId,
    timeZone: ianaTimeZone,
    ...(address && { address }),
    ...(phoneNumber && { phoneNumber }),
    ...(logo && { logo }),
  });

  // Automatically create default order types for the new outlet
  await createDefaultOrderTypesForOutlet(req.user.companyId as string, brandId, outlet._id as string);

  return {
    message: "Outlet created successfully",
    outlet: {
      _id: outlet._id,
      name: outlet.name,
      status: outlet.status,
      brandId: outlet.brandId,
      companyId: outlet.companyId,
      timeZone: outlet.timeZone,
      address: outlet.address,
      phoneNumber: outlet.phoneNumber,
      logo: outlet.logo,
      createdAt: outlet.createdAt,
      updatedAt: outlet.updatedAt,
    },
  };
};

export const getOutlets = async (req: RequestWithUser, res: Response) => {
  const { brandId } = req.query;

  // Check if user has a company
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company to view outlets");
  }

  const filter: any = { companyId: req.user.companyId };

  if (brandId) {
    if (!mongoose.Types.ObjectId.isValid(brandId as string)) {
      throw utils.createError(400, "Invalid brand ID");
    }
    filter.brandId = brandId;
  }

  // Non-admins only see active outlets and only under active brands
  if (req.user.role !== UserRole.ADMIN) {
    filter.status = ActiveStatus.ACTIVE;
  }

  const { page, limit, skip } = getPaginationParams(req as any);
  const allowAllResponse = ((req.query as any).allowAllResponse + "").toLowerCase() === "true";
  const total = await OutletsModel.countDocuments(filter);
  const baseQuery = OutletsModel.find(filter).sort({ name: 1 }).populate("brandId", "name status").populate("companyId", "name");
  const outlets = allowAllResponse ? await baseQuery : await baseQuery.skip(skip).limit(limit);

  const visibleOutlets =
    req.user.role === UserRole.ADMIN ? outlets : outlets.filter((o) => (o as any).brandId?.status === ActiveStatus.ACTIVE);

  const data = visibleOutlets.map((outlet) => ({
    _id: outlet._id,
    name: outlet.name,
    status: outlet.status,
    brandId: outlet.brandId,
    brandName: (outlet.brandId as any)?.name,
    companyId: outlet.companyId,
    company: (outlet.companyId as any)?.name ? { _id: (outlet.companyId as any)._id, name: (outlet.companyId as any).name } : null,
    timeZone: outlet.timeZone,
    address: outlet.address,
    phoneNumber: outlet.phoneNumber,
    logo: (outlet as any).logo,
    createdAt: outlet.createdAt,
    updatedAt: outlet.updatedAt,
  }));

  return buildPagedResponse(data, allowAllResponse ? 1 : page, allowAllResponse ? total : limit, total);
};

export const getOutletById = async (req: RequestWithUser, res: Response) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw utils.createError(400, "Invalid outlet ID");
  }

  // Check if user has a company
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company to view outlets");
  }

  const outlet = await OutletsModel.findOne({
    _id: id,
    companyId: req.user.companyId,
  })
    .populate("brandId", "name status")
    .populate("companyId", "name");

  if (!outlet) {
    throw utils.createError(404, "Outlet not found");
  }

  // Non-admins cannot access inactive outlets nor outlets of inactive brands
  if (req.user.role !== UserRole.ADMIN) {
    if (outlet.status !== ActiveStatus.ACTIVE || (outlet.brandId as any)?.status !== ActiveStatus.ACTIVE) {
      throw utils.createError(404, "Outlet not found");
    }
  }

  return {
    outlet: {
      _id: outlet._id,
      name: outlet.name,
      status: outlet.status,
      brandId: outlet.brandId,
      brandName: (outlet.brandId as any)?.name,
      companyId: outlet.companyId,
      company: (outlet.companyId as any)?.name ? { _id: (outlet.companyId as any)._id, name: (outlet.companyId as any).name } : null,
      timeZone: outlet.timeZone,
      address: outlet.address,
      phoneNumber: outlet.phoneNumber,
      logo: (outlet as any).logo,
      createdAt: outlet.createdAt,
      updatedAt: outlet.updatedAt,
    },
  };
};

export const updateOutlet = async (req: RequestWithUser, res: Response) => {
  const { id } = req.params;
  const { name, status, brandId, timeZone, address, phoneNumber, logo } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw utils.createError(400, "Invalid outlet ID");
  }

  // Check if user is admin
  if (req.user.role !== UserRole.ADMIN) {
    throw utils.createError(403, "Only admin users can update outlets");
  }

  // Check if user has a company
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company to update outlets");
  }

  const updateData: any = {};
  if (name) updateData.name = name;
  if (status) {
    if (!isValidActiveStatus(status)) throw utils.createError(400, "Invalid status value");
    updateData.status = status;
  }
  if (timeZone) {
    // Convert timezone from client format (e.g., "IST +05:30") to IANA format (e.g., "Asia/Kolkata")
    const ianaTimeZone = utils.convertToIANATimeZone(timeZone);
    updateData.timeZone = ianaTimeZone;
  }
  if (address !== undefined) updateData.address = address;
  if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
  if (logo !== undefined) updateData.logo = logo;
  if (brandId) {
    if (!mongoose.Types.ObjectId.isValid(brandId)) {
      throw utils.createError(400, "Invalid brand ID");
    }

    // Verify brand exists and belongs to user's company
    const brand = await BrandModel.findOne({
      _id: brandId,
      companyId: req.user.companyId,
    });

    if (!brand) {
      throw utils.createError(404, "Brand not found or doesn't belong to your company");
    }

    if (brand.status !== ActiveStatus.ACTIVE) {
      throw utils.createError(400, "Cannot move outlet under an inactive brand");
    }

    updateData.brandId = brandId;
  }

  const outlet = await OutletsModel.findOneAndUpdate({ _id: id, companyId: req.user.companyId }, updateData, { new: true })
    .populate("brandId", "name")
    .populate("companyId", "name");

  if (!outlet) {
    throw utils.createError(404, "Outlet not found");
  }

  return {
    message: "Outlet updated successfully",
    outlet: {
      _id: outlet._id,
      name: outlet.name,
      status: outlet.status,
      brandId: outlet.brandId,
      brandName: (outlet.brandId as any)?.name,
      companyId: outlet.companyId,
      company: (outlet.companyId as any)?.name ? { _id: (outlet.companyId as any)._id, name: (outlet.companyId as any).name } : null,
      timeZone: outlet.timeZone,
      address: outlet.address,
      phoneNumber: outlet.phoneNumber,
      logo: (outlet as any).logo,
      createdAt: outlet.createdAt,
      updatedAt: outlet.updatedAt,
    },
  };
};

export const deleteOutlet = async (req: RequestWithUser, res: Response) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw utils.createError(400, "Invalid outlet ID");
  }

  // Check if user is admin
  if (req.user.role !== UserRole.ADMIN) {
    throw utils.createError(403, "Only admin users can delete outlets");
  }

  // Check if user has a company
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company to delete outlets");
  }

  const outlet = await OutletsModel.findOneAndDelete({
    _id: id,
    companyId: req.user.companyId,
  });

  if (!outlet) {
    throw utils.createError(404, "Outlet not found");
  }

  return {
    message: "Outlet deleted successfully",
  };
};

export const checkAndCopyCategories = async (req: RequestWithUser, res: Response) => {
  const { outletId, fromOutletId, brandId, forceImport } = req.body;
  const { page, limit } = getPaginationParams(req as any);
  const allowAllResponse = ((req.query as any).allowAllResponse + "").toLowerCase() === "true";
  const shouldForceImport = forceImport === true || forceImport === "true";

  // Validate required fields
  if (!outletId) {
    throw utils.createError(400, "outletId is required");
  }
  if (!fromOutletId) {
    throw utils.createError(400, "fromOutletId is required");
  }
  if (!brandId) {
    throw utils.createError(400, "brandId is required");
  }

  // Validate ObjectIds
  if (!mongoose.Types.ObjectId.isValid(outletId)) {
    throw utils.createError(400, "Invalid outletId");
  }
  if (!mongoose.Types.ObjectId.isValid(fromOutletId)) {
    throw utils.createError(400, "Invalid fromOutletId");
  }
  if (!mongoose.Types.ObjectId.isValid(brandId)) {
    throw utils.createError(400, "Invalid brandId");
  }

  // Check if user has a company
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company");
  }

  // Verify target outlet exists and belongs to user's company
  const targetOutlet = await OutletsModel.findOne({
    _id: outletId,
    companyId: req.user.companyId,
  });

  if (!targetOutlet) {
    throw utils.createError(404, "Target outlet not found or doesn't belong to your company");
  }

  // Verify source outlet exists and belongs to user's company
  const sourceOutlet = await OutletsModel.findOne({
    _id: fromOutletId,
    companyId: req.user.companyId,
  });

  if (!sourceOutlet) {
    throw utils.createError(404, "Source outlet not found or doesn't belong to your company");
  }

  // Explicit check: Ensure both outlets belong to the same company
  if (targetOutlet.companyId.toString() !== sourceOutlet.companyId.toString()) {
    throw utils.createError(400, "Cannot import menu between outlets from different companies");
  }

  // Verify brand exists and belongs to user's company
  const brand = await BrandModel.findOne({
    _id: brandId,
    companyId: req.user.companyId,
  });

  if (!brand) {
    throw utils.createError(404, "Brand not found or doesn't belong to your company");
  }

  // Check if target outlet already has categories (for informational purposes only)
  const existingCategories = await MenuCategoryModel.find({
    outletId: outletId,
    companyId: req.user.companyId,
  });

  const existingMenuItems = await MenuItemModel.find({
    outletId: outletId,
    companyId: req.user.companyId,
  });

  // Get categories from source outlet BEFORE deleting anything (for data safety)
  const sourceCategories = await MenuCategoryModel.find({
    outletId: fromOutletId,
    companyId: req.user.companyId,
  });

  if (sourceCategories.length === 0) {
    throw utils.createError(404, "Source outlet has no categories to copy");
  }

  // Get all menu items from source outlet BEFORE deleting anything (for data safety)
  const sourceMenuItems = await MenuItemModel.find({
    outletId: fromOutletId,
    companyId: req.user.companyId,
  });

  // Copy categories to target outlet with new brandId
  const categoriesToCreate = sourceCategories.map((category) => ({
    name: category.name,
    displayOrder: category.displayOrder,
    isActive: category.isActive,
    companyId: req.user.companyId,
    brandId: brandId,
    outletId: outletId,
  }));

  const createdCategories = await MenuCategoryModel.insertMany(categoriesToCreate);

  if (!createdCategories || createdCategories.length === 0) {
    throw utils.createError(500, "Failed to create categories during import");
  }

  // Create a mapping of old category IDs to new category IDs
  const categoryIdMapping = new Map();
  sourceCategories.forEach((oldCategory, index) => {
    categoryIdMapping.set(oldCategory._id.toString(), createdCategories[index]._id);
  });

  // Copy menu items to target outlet with new category IDs and brandId
  const menuItemsToCreate = sourceMenuItems.map((menuItem) => ({
    name: menuItem.name,
    description: menuItem.description,
    imageURL: menuItem.imageURL,
    price: menuItem.price,
    isActive: menuItem.isActive,
    companyId: req.user.companyId,
    brandId: brandId,
    outletId: outletId,
    categoryId: categoryIdMapping.get(menuItem.categoryId.toString()),
  }));

  const createdMenuItems = await MenuItemModel.insertMany(menuItemsToCreate);

  if (!createdMenuItems || createdMenuItems.length === 0) {
    throw utils.createError(500, "Failed to create menu items during import");
  }

  // Note: We are ADDING items to the outlet, not replacing existing ones
  // Existing categories and menu items will remain intact

  // Get the created categories with populated fields (with pagination)
  const total = createdCategories.length;
  const baseQuery = MenuCategoryModel.find({
    _id: { $in: createdCategories.map((cat) => cat._id) },
  })
    .populate("companyId", "name")
    .populate("brandId", "name")
    .populate("outletId", "name")
    .sort({ displayOrder: 1, name: 1 });

  const populatedCategories = allowAllResponse ? await baseQuery : await baseQuery.skip((page - 1) * limit).limit(limit);

  // Get menu items for each created category
  const categoriesWithItems = await Promise.all(
    populatedCategories.map(async (category) => {
      const menuItems = await MenuItemModel.find({
        categoryId: category._id,
        companyId: req.user.companyId,
      })
        .populate("companyId", "name")
        .populate("brandId", "name")
        .populate("outletId", "name")
        .populate("categoryId", "name")
        .sort({ name: 1 });

      return {
        ...category.toObject(),
        menuItems: menuItems,
      };
    }),
  );

  const response = buildPagedResponse(categoriesWithItems, allowAllResponse ? 1 : page, allowAllResponse ? total : limit, total);

  // Count total items now in the outlet (existing + imported)
  const totalCategoriesNow = await MenuCategoryModel.countDocuments({
    outletId: outletId,
    companyId: req.user.companyId,
  });
  const totalMenuItemsNow = await MenuItemModel.countDocuments({
    outletId: outletId,
    companyId: req.user.companyId,
  });

  const message =
    existingCategories.length > 0
      ? `Successfully added ${createdCategories.length} categories and ${createdMenuItems.length} menu items to existing menu. Outlet now has ${totalCategoriesNow} total categories and ${totalMenuItemsNow} total menu items.`
      : `Successfully imported ${createdCategories.length} categories and ${createdMenuItems.length} menu items from source outlet`;

  return {
    ...response,
    message,
    imported: true,
    importSummary: {
      categoriesImported: createdCategories.length,
      menuItemsImported: createdMenuItems.length,
      existingCategoriesBefore: existingCategories.length,
      existingMenuItemsBefore: existingMenuItems.length,
      totalCategoriesNow,
      totalMenuItemsNow,
      sourceOutletId: fromOutletId,
      targetOutletId: outletId,
    },
  };
};
