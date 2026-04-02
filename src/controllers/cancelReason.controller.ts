import mongoose from "mongoose";
import { RequestWithUser } from "../types/utils";
import Utils from "../utils";
import CancelReasonModel from "../models/cancelReason";
import OrderModel from "../models/order";
import BrandModel from "../models/brand";
import OutletsModel from "../models/outlets";
import { UserRole } from "../types/user";

const utils = new Utils();

export const createCancelReason = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  const { reason } = req.body as any;

  if (!reason || typeof reason !== "string" || !reason.trim()) throw utils.createError(400, "reason is required");
  // Infer brand/outlet from user if not ADMIN
  let inferredOutletId = req.user.outletId as string | undefined;

  // Admin may create for any outlet/brand; allow optional payload for admin
  if (req.user.role === UserRole.ADMIN) {
    const { outletId } = req.body as any;
    inferredOutletId = outletId || inferredOutletId;
  }

  if (!inferredOutletId) throw utils.createError(400, "outletId missing; inferred from user or provide for admin");
  if (!mongoose.Types.ObjectId.isValid(inferredOutletId)) throw utils.createError(400, "Invalid outletId");

  // Validate brand and outlet belong to user's company
  const outlet = await OutletsModel.findOne({ _id: inferredOutletId, companyId: req.user.companyId });
  if (!outlet) throw utils.createError(404, "Outlet not found in your company/brand");
  const inferredBrandId = String(outlet.brandId);

  // Prevent duplicates within company/brand/outlet
  const exists = await CancelReasonModel.findOne({
    companyId: req.user.companyId,
    brandId: inferredBrandId,
    outletId: inferredOutletId,
    reason: reason.trim(),
  });
  if (exists) throw utils.createError(400, "Reason already exists for this outlet");

  const created = await CancelReasonModel.create({
    reason: reason.trim(),
    createdBy: req.user._id,
    companyId: req.user.companyId,
    brandId: inferredBrandId,
    outletId: inferredOutletId,
  } as any);
  return created;
};

export const listCancelReasons = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  let inferredOutletId = req.user.outletId as string | undefined;
  let inferredBrandId = req.user.brandId as string | undefined;

  // Admin can scope via query
  const { outletId, brandId } = req.query as any;
  if (req.user.role === UserRole.ADMIN) {
    inferredOutletId = (outletId as string) || inferredOutletId;
    inferredBrandId = (brandId as string) || inferredBrandId;
  }

  if (!inferredOutletId) throw utils.createError(400, "outletId is required");
  if (!mongoose.Types.ObjectId.isValid(inferredOutletId)) throw utils.createError(400, "Invalid outletId");
  const outlet = await OutletsModel.findOne({ _id: inferredOutletId, companyId: req.user.companyId });
  if (!outlet) throw utils.createError(404, "Outlet not found in your company");

  const filter: any = { companyId: req.user.companyId, outletId: inferredOutletId };

  return await CancelReasonModel.find(filter).sort({ createdAt: -1 });
};

export const deleteCancelReason = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  const { id } = req.params as any;
  const { outletId } = req.query as any;
  if (!mongoose.Types.ObjectId.isValid(id)) throw utils.createError(400, "Invalid reason id");
  if (req.user.role === UserRole.ADMIN && !outletId && !req.user.outletId) {
    throw utils.createError(400, "outletId is required");
  }
  const inferredOutletId = (req.user.role === UserRole.ADMIN ? (outletId as string) || (req.user.outletId as string) : (req.user.outletId as string));
  if (!inferredOutletId) throw utils.createError(400, "outletId is required");
  if (!mongoose.Types.ObjectId.isValid(inferredOutletId)) throw utils.createError(400, "Invalid outletId");

  // Ensure reason belongs to user's company
  const reason = await CancelReasonModel.findOne({ _id: id, companyId: req.user.companyId });
  if (!reason) throw utils.createError(404, "Reason not found");

  // Non-admin must only delete within their own outlet/brand scope
  if (req.user.role !== UserRole.ADMIN) {
    if (req.user.outletId && String(reason.outletId) !== String(req.user.outletId)) {
      throw utils.createError(403, "Not allowed to delete reason from another outlet");
    }
    if (req.user.brandId && String(reason.brandId) !== String(req.user.brandId)) {
      throw utils.createError(403, "Not allowed to delete reason from another brand");
    }
  }
  // Admin: ensure provided outlet matches the reason
  if (req.user.role === UserRole.ADMIN) {
    if (String(reason.outletId) !== String(inferredOutletId)) {
      throw utils.createError(403, "Reason does not belong to the specified outlet");
    }
  }

  // Prevent deletion if used by any order
  const usedByOrder = await OrderModel.findOne({ orderCancelledReasonId: id });
  if (usedByOrder) throw utils.createError(400, "Cannot delete reason that is used by an order");

  await CancelReasonModel.deleteOne({ _id: id });
  return { message: "Reason deleted successfully" };
};
