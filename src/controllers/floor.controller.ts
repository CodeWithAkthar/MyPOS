import mongoose from "mongoose";
import { RequestWithUser } from "../types/utils";
import OutletsModel from "../models/outlets";
import FloorModel from "../models/floor";
import Utils from "../utils";
import { getPaginationParams, buildPagedResponse } from "../utils/pagination";

const utils = new Utils();

function assertValidObjectId(id: string, name: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw utils.createError(400, `Invalid ${name}`);
}

async function ensureOutletUnderCompany(companyId: string, outletId: string) {
  const outlet = await OutletsModel.findOne({ _id: outletId, companyId });
  if (!outlet) throw utils.createError(404, "Outlet not found in your company");
  return outlet;
}

export const createFloor = async (req: RequestWithUser) => {
  const { name, outletId, displayOrder, isActive } = req.body;

  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  if (!name) throw utils.createError(400, "Floor name is required");
  if (!outletId) throw utils.createError(400, "Outlet ID is required");
  if (displayOrder === undefined) throw utils.createError(400, "Display order is required");

  assertValidObjectId(outletId, "outletId");

  // Validate that the outlet belongs to user's company
  const outlet = await ensureOutletUnderCompany(req.user.companyId, outletId);

  const existingFloor = await FloorModel.findOne({ name, outletId });
  if (existingFloor) {
    throw utils.createError(400, `Floor with name "${name}" already exists in this outlet`);
  }

  // Shift existing floors if inserting in between
  await FloorModel.updateMany(
    {
      outletId,
      companyId: req.user.companyId,
      displayOrder: { $gte: displayOrder },
    },
    { $inc: { displayOrder: 1 } }
  );

  const newFloor = await FloorModel.create({
    name,
    outletId,
    displayOrder,
    ...(isActive !== undefined ? { isActive: !!isActive } : {}),
    brandId: outlet.brandId,
    companyId: outlet.companyId,
  });

  return {
    _id: newFloor._id,
    name: newFloor.name,
    displayOrder: newFloor.displayOrder,
    outletId: newFloor.outletId,
    isActive: newFloor.isActive,
    brandId: outlet.brandId,
    companyId: outlet.companyId,
  };
};

export const listFloors = async (req: RequestWithUser) => {
  const { outletId } = req.query as any;
  const isActiveQuery = (req.query as any).isActive as string | undefined;

  if (!outletId) throw utils.createError(400, "Outlet ID is required");
  assertValidObjectId(outletId as string, "outletId");

  // Ensure outlet belongs to user's company
  await ensureOutletUnderCompany(req.user.companyId as string, outletId as string);

  const filter: any = { outletId, companyId: req.user.companyId };
  if (isActiveQuery) {
    if (!["active", "inactive"].includes(isActiveQuery)) throw utils.createError(400, "Invalid isActive filter");
    filter.isActive = isActiveQuery === "active";
  }
  const { page, limit, skip } = getPaginationParams(req as any);
  const allowAllResponse = ((req.query as any).allowAllResponse + "").toLowerCase() === "true";
  const total = await FloorModel.countDocuments(filter);
  const baseQuery = FloorModel.find(filter).sort({ displayOrder: 1 });
  const floors = allowAllResponse ? await baseQuery : await baseQuery.skip(skip).limit(limit);

  const data = floors.map((floor) => ({
    _id: floor._id,
    name: floor.name,
    outletId: floor.outletId,
    displayOrder: floor.displayOrder,
    isActive: floor.isActive,
    brandId: floor.brandId,
    companyId: floor.companyId,
  }));
  return buildPagedResponse(data, allowAllResponse ? 1 : page, allowAllResponse ? total : limit, total);
};

export const deleteFloor = async (req: RequestWithUser) => {
  const { floorId } = req.params;

  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  if (!floorId) throw utils.createError(400, "Floor ID is required");
  assertValidObjectId(floorId, "floorId");

  // Find floor
  const floor = await FloorModel.findOne({ _id: new mongoose.Types.ObjectId(floorId), companyId: req.user.companyId });
  if (!floor) throw utils.createError(404, "Floor not found");

  // Ensure the outlet of this floor belongs to user's company
  await ensureOutletUnderCompany(req.user.companyId, floor.outletId.toString());

  // Delete
  await FloorModel.deleteOne({ _id: new mongoose.Types.ObjectId(floorId), companyId: req.user.companyId });

  // Optional: Shift remaining floors to close the gap?
  // Not strictly requested, but good practice. Leaving out for now to strictly follow "decrement when added" request.

  return { message: "Floor deleted successfully" };
};

export const updateFloor = async (req: RequestWithUser) => {
  const { floorId } = req.params;
  const { name, isActive, displayOrder } = req.body as any;

  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  if (!floorId) throw utils.createError(400, "Floor ID is required");
  assertValidObjectId(floorId, "floorId");

  if (!name && isActive === undefined && displayOrder === undefined) throw utils.createError(400, "Nothing to update");

  // Find floor
  const floor = await FloorModel.findOne({ _id: new mongoose.Types.ObjectId(floorId), companyId: req.user.companyId });
  if (!floor) throw utils.createError(404, "Floor not found");

  // Ensure outlet belongs to company
  await ensureOutletUnderCompany(req.user.companyId, floor.outletId.toString());

  // Check if another floor with same name exists in same outlet
  if (name) {
    const existing = await FloorModel.findOne({
      _id: { $ne: new mongoose.Types.ObjectId(floorId) },
      outletId: floor.outletId,
      name,
      companyId: req.user.companyId,
    });
    if (existing) throw utils.createError(400, "Floor name already exists in this outlet");
  }

  // Handle display order change
  if (displayOrder !== undefined && displayOrder !== floor.displayOrder) {
    const oldOrder = floor.displayOrder;
    const newOrder = displayOrder;

    if (newOrder < oldOrder) {
      // Moving UP: Shift items in [newOrder, oldOrder-1] DOWN (+1)
      await FloorModel.updateMany(
        {
          outletId: floor.outletId,
          companyId: req.user.companyId,
          displayOrder: { $gte: newOrder, $lt: oldOrder },
        },
        { $inc: { displayOrder: 1 } }
      );
    } else if (newOrder > oldOrder) {
      // Moving DOWN: Shift items in [oldOrder+1, newOrder] UP (-1)
      await FloorModel.updateMany(
        {
          outletId: floor.outletId,
          companyId: req.user.companyId,
          displayOrder: { $gt: oldOrder, $lte: newOrder },
        },
        { $inc: { displayOrder: -1 } }
      );
    }
    floor.displayOrder = newOrder;
  }

  // Update
  if (name) floor.name = name;
  if (isActive !== undefined) floor.isActive = !!isActive;
  await floor.save();

  return {
    _id: floor._id,
    name: floor.name,
    outletId: floor.outletId,
    displayOrder: floor.displayOrder,
    isActive: floor.isActive,
    brandId: floor.brandId,
    companyId: floor.companyId,
  };
};
