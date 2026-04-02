import { Response } from "express";
import mongoose from "mongoose";
import { RequestWithUser } from "../types/utils";
import { UserRole } from "../types/user";
import Utils from "../utils";
import OrderTypeModel from "../models/orderType";
import { OrderFieldRequirement, OrderTypeKey } from "../types/orderType";
import { isValidActiveStatus, isValidOrderFieldRequirement, isValidOrderTypeKey } from "../utils/validators";
import BrandModel from "../models/brand";
import OutletsModel from "../models/outlets";
import { ActiveStatus } from "../types/brand";

const utils = new Utils();

function assertValidObjectId(id: string, name: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw utils.createError(400, `Invalid ${name}`);
}

async function ensureBrandAndOutletUnderCompany(companyId: string, brandId: string, outletId: string) {
  const [brand, outlet] = await Promise.all([
    BrandModel.findOne({ _id: brandId, companyId }),
    OutletsModel.findOne({ _id: outletId, companyId }),
  ]);
  if (!brand) throw utils.createError(404, "Brand not found in your company");
  if (!outlet) throw utils.createError(404, "Outlet not found in your company");
  if (outlet.brandId + "" !== brand._id + "") throw utils.createError(400, "Outlet does not belong to the provided brand");
}

const DEFAULTS: Record<OrderTypeKey, Partial<any>> = {
  [OrderTypeKey.DINE_IN]: {
    tableRequirement: OrderFieldRequirement.REQUIRED,
    guestCountRequirement: OrderFieldRequirement.OPTIONAL,
    isActive: ActiveStatus.ACTIVE,
    typeId: 1,
  },
  [OrderTypeKey.TAKEAWAY]: {
    isActive: ActiveStatus.ACTIVE,
    typeId: 2,
  },
  [OrderTypeKey.DELIVERY]: {
    customerNameRequirement: OrderFieldRequirement.REQUIRED,
    phoneNumberRequirement: OrderFieldRequirement.REQUIRED,
    addressRequirement: OrderFieldRequirement.REQUIRED,
    isActive: ActiveStatus.ACTIVE,
    typeId: 3,
  },
};

async function createIfNotExists(companyId: string, brandId: string, outletId: string, type: OrderTypeKey) {
  const existing = await OrderTypeModel.findOne({ companyId, brandId, outletId, type });
  if (existing) return existing;
  const created = await OrderTypeModel.create({ companyId, brandId, outletId, type, ...DEFAULTS[type] });
  return created;
}

/**
 * Creates default order types for a newly created outlet.
 * This function is meant to be called internally when an outlet is created.
 * @param companyId - The company ID
 * @param brandId - The brand ID
 * @param outletId - The outlet ID
 * @returns Array of created order types
 */
export async function createDefaultOrderTypesForOutlet(companyId: string, brandId: string, outletId: string) {
  // Create all three default order types (dine-in, takeaway, delivery)
  const [dineIn, takeaway, delivery] = await Promise.all([
    createIfNotExists(companyId, brandId, outletId, OrderTypeKey.DINE_IN),
    createIfNotExists(companyId, brandId, outletId, OrderTypeKey.TAKEAWAY),
    createIfNotExists(companyId, brandId, outletId, OrderTypeKey.DELIVERY),
  ]);

  return [dineIn, takeaway, delivery];
}

export const getAllOrderTypes = async (req: RequestWithUser, res: Response) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  const { outletId } = req.query as any;

  if (!outletId) throw utils.createError(400, "outletId is required");
  assertValidObjectId(outletId, "outlet id");

  // infer brand from outlet and validate under company
  const outlet = await OutletsModel.findOne({ _id: outletId, companyId: req.user.companyId });
  if (!outlet) throw utils.createError(404, "Outlet not found in your company");
  const brandId = outlet.brandId + "";
  await ensureBrandAndOutletUnderCompany(req.user.companyId as string, brandId, outletId);

  const companyId = new mongoose.Types.ObjectId(req.user.companyId);
  // Ensure all three exist
  const [dineIn, takeaway, delivery] = await Promise.all([
    createIfNotExists(companyId as any, brandId, outletId, OrderTypeKey.DINE_IN),
    createIfNotExists(companyId as any, brandId, outletId, OrderTypeKey.TAKEAWAY),
    createIfNotExists(companyId as any, brandId, outletId, OrderTypeKey.DELIVERY),
  ]);

  const typeIdMap: Record<OrderTypeKey, number> = {
    [OrderTypeKey.DINE_IN]: 1,
    [OrderTypeKey.TAKEAWAY]: 2,
    [OrderTypeKey.DELIVERY]: 3,
  };

  const orderTypesWithStaticId = [dineIn, takeaway, delivery].map((ot: any) => ({
    ...(ot.toObject?.() ?? ot),
    typeId: typeIdMap[ot.type as OrderTypeKey],
  }));

  return {
    orderTypes: orderTypesWithStaticId,
  };
};

export const updateOrderType = async (req: RequestWithUser, res: Response) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  if (req.user.role !== UserRole.ADMIN) throw utils.createError(403, "Only admin users can update order types");

  const typeParam = (req.params.type + "").toLowerCase();
  if (!isValidOrderTypeKey(typeParam)) throw utils.createError(400, "Invalid order type");

  const { outletId } = req.body as any;
  if (!outletId) throw utils.createError(400, "outletId is required");
  assertValidObjectId(outletId, "outlet id");

  // infer brand from outlet and validate under company
  const outlet = await OutletsModel.findOne({ _id: outletId, companyId: req.user.companyId });
  if (!outlet) throw utils.createError(404, "Outlet not found in your company");
  const brandId = outlet.brandId + "";
  await ensureBrandAndOutletUnderCompany(req.user.companyId as string, brandId, outletId);

  const companyId = new mongoose.Types.ObjectId(req.user.companyId);

  // Build update set by type
  const payload: any = {};
  if (typeParam === OrderTypeKey.DINE_IN) {
    const { tableRequirement, guestCountRequirement, isActive } = req.body as any;
    // if (!tableRequirement || !guestCountRequirement || !isActive) throw utils.createError(400, "Missing required fields for dine-in");
    if (tableRequirement && !isValidOrderFieldRequirement(tableRequirement)) throw utils.createError(400, "Invalid tableRequirement value");
    if (guestCountRequirement && !isValidOrderFieldRequirement(guestCountRequirement)) throw utils.createError(400, "Invalid guestCountRequirement value");
    if (isActive && !isValidActiveStatus(isActive)) throw utils.createError(400, "Invalid isActive value");
    
    if (tableRequirement) payload.tableRequirement = tableRequirement;
    if (guestCountRequirement) payload.guestCountRequirement = guestCountRequirement;
    if (isActive) payload.isActive = isActive;
  } else if (typeParam === OrderTypeKey.TAKEAWAY) {
    const { isActive } = req.body as any;
    // if (!isActive) throw utils.createError(400, "Missing required fields for takeaway");
    if (isActive && !isValidActiveStatus(isActive)) throw utils.createError(400, "Invalid isActive value");
    if (isActive) payload.isActive = isActive;
  } else if (typeParam === OrderTypeKey.DELIVERY) {
    const { customerNameRequirement, phoneNumberRequirement, addressRequirement, isActive } = req.body as any;
    // if (!customerNameRequirement || !phoneNumberRequirement || !addressRequirement || !isActive)
    //   throw utils.createError(400, "Missing required fields for delivery");
    if (customerNameRequirement && !isValidOrderFieldRequirement(customerNameRequirement)) throw utils.createError(400, "Invalid customerNameRequirement value");
    if (phoneNumberRequirement && !isValidOrderFieldRequirement(phoneNumberRequirement)) throw utils.createError(400, "Invalid phoneNumberRequirement value");
    if (addressRequirement && !isValidOrderFieldRequirement(addressRequirement)) throw utils.createError(400, "Invalid addressRequirement value");
    if (isActive && !isValidActiveStatus(isActive)) throw utils.createError(400, "Invalid isActive value");
    
    if (customerNameRequirement) payload.customerNameRequirement = customerNameRequirement;
    if (phoneNumberRequirement) payload.phoneNumberRequirement = phoneNumberRequirement;
    if (addressRequirement) payload.addressRequirement = addressRequirement;
    if (isActive) payload.isActive = isActive;
  }

  const updated = await OrderTypeModel.findOneAndUpdate(
    { companyId, brandId, outletId, type: typeParam },
    { $set: payload },
    { new: true, upsert: true },
  );

  return {
    message: "Order type updated successfully",
    orderType: updated,
  };
};
