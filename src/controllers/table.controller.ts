import TableModel from "../models/table";
import FloorModel from "../models/floor";
import OrderModel from "../models/order";
import { RequestWithUser } from "../types/utils";
import { OrderStatus } from "../types/order";
import Utils from "../utils";
import mongoose from "mongoose";
import { ensureFloorUnderCompany, ensureOutletUnderCompany } from "../services/validators";
import { getPaginationParams, buildPagedResponse } from "../utils/pagination";

const utils = new Utils();

function assertValidObjectId(id: string, name: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw utils.createError(400, `Invalid ${name}`);
  }
}

export const createTable = async (req: RequestWithUser) => {
  const { name, seatCapacity, displayOrder, floorId, isActive, isOccupied } = req.body as any;

  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  if (!name) throw utils.createError(400, "Table name is required");
  if (!floorId) throw utils.createError(400, "Floor ID is required");
  if (!seatCapacity) throw utils.createError(400, "Seat capacity is required");
  if (!displayOrder && displayOrder !== 0) throw utils.createError(400, "Display order is required");

  assertValidObjectId(floorId, "floorId");

  // Ensure floor belongs to user's company
  const floor = await FloorModel.findOne({ _id: new mongoose.Types.ObjectId(floorId), companyId: req.user.companyId });
  if (!floor) throw utils.createError(404, "Floor not found");

  const outlet = await ensureOutletUnderCompany(req.user.companyId, floor.outletId.toString());

  // Check if table with same name already exists in the same floor
  const existing = await TableModel.findOne({ floorId, name, companyId: req.user.companyId });
  if (existing) throw utils.createError(400, "Table with this name already exists in this floor");

  // Shift existing tables if displayOrder is provided
  // If we insert at displayOrder X, all tables with displayOrder >= X should be incremented
  await TableModel.updateMany(
    {
      floorId,
      companyId: req.user.companyId,
      displayOrder: { $gte: displayOrder },
    },
    { $inc: { displayOrder: 1 } },
  );

  const newTable = await TableModel.create({
    name,
    seatCapacity,
    displayOrder,
    floorId,
    ...(isActive !== undefined ? { isActive: !!isActive } : {}),
    ...(isOccupied !== undefined ? { isOccupied: !!isOccupied } : {}),
    brandId: outlet.brandId,
    companyId: outlet.companyId,
    outletId: outlet._id,
  });

  // Check if table is actually occupied by an open order
  const hasOpenOrder = await OrderModel.exists({
    companyId: req.user.companyId,
    status: OrderStatus.OPEN,
    "dineIn.tableId": newTable._id,
  });

  const isCurrentlyOccupied = hasOpenOrder !== null;

  return {
    _id: newTable._id,
    name: newTable.name,
    seatCapacity: newTable.seatCapacity,
    displayOrder: newTable.displayOrder,
    isActive: newTable.isActive,
    isOccupied: isCurrentlyOccupied,
    status: isCurrentlyOccupied ? "busy" : "available",
    floorId: newTable.floorId,
    companyId: newTable.companyId,
    brandId: newTable.brandId,
    outletId: newTable.outletId,
  };
};

export const updateTable = async (req: RequestWithUser) => {
  const { tableId } = req.params;
  const { name, seatCapacity, displayOrder, isActive, isOccupied } = req.body as any;

  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  assertValidObjectId(tableId, "tableId");

  const table = await TableModel.findOne({ _id: new mongoose.Types.ObjectId(tableId), companyId: req.user.companyId });
  if (!table) throw utils.createError(404, "Table not found");

  // Ensure floor belongs to company
  await ensureFloorUnderCompany(req.user.companyId, table.floorId);

  // Check duplicate name in same floor
  if (name) {
    const duplicate = await TableModel.findOne({
      name,
      floorId: table.floorId,
      _id: { $ne: new mongoose.Types.ObjectId(tableId) },
      companyId: req.user.companyId,
    });
    if (duplicate) throw utils.createError(400, "Table name already exists in this floor");
  }

  // Handle displayOrder change with reordering
  if (displayOrder !== undefined && displayOrder !== table.displayOrder) {
    const oldOrder = table.displayOrder;
    const newOrder = displayOrder;

    if (newOrder < oldOrder) {
      // Moving UP (e.g., 5 -> 2): Increment items in [newOrder, oldOrder - 1]
      await TableModel.updateMany(
        {
          floorId: table.floorId,
          companyId: req.user.companyId,
          displayOrder: { $gte: newOrder, $lt: oldOrder },
          _id: { $ne: table._id },
        },
        { $inc: { displayOrder: 1 } },
      );
    } else if (newOrder > oldOrder) {
      // Moving DOWN (e.g., 2 -> 5): Decrement items in [oldOrder + 1, newOrder]
      await TableModel.updateMany(
        {
          floorId: table.floorId,
          companyId: req.user.companyId,
          displayOrder: { $gt: oldOrder, $lte: newOrder },
          _id: { $ne: table._id },
        },
        { $inc: { displayOrder: -1 } },
      );
    }
    table.displayOrder = displayOrder;
  }

  if (name) table.name = name;
  if (seatCapacity) table.seatCapacity = seatCapacity;
  if (isActive !== undefined) table.isActive = !!isActive;
  if (isOccupied !== undefined) table.isOccupied = !!isOccupied;

  await table.save();

  // Check if table is actually occupied by an open order
  const hasOpenOrder = await OrderModel.exists({
    companyId: req.user.companyId,
    status: OrderStatus.OPEN,
    "dineIn.tableId": table._id,
  });

  const isCurrentlyOccupied = hasOpenOrder !== null;

  return {
    _id: table._id,
    name: table.name,
    seatCapacity: table.seatCapacity,
    displayOrder: table.displayOrder,
    isActive: table.isActive,
    isOccupied: isCurrentlyOccupied,
    status: isCurrentlyOccupied ? "busy" : "available",
    floorId: table.floorId,
    companyId: table.companyId,
    brandId: table.brandId,
    outletId: table.outletId,
  };
};

export const deleteTable = async (req: RequestWithUser) => {
  const { tableId } = req.params;

  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  assertValidObjectId(tableId, "tableId");

  const table = await TableModel.findOne({ _id: new mongoose.Types.ObjectId(tableId), companyId: req.user.companyId });
  if (!table) throw utils.createError(404, "Table not found");

  // Ensure floor belongs to company
  await ensureFloorUnderCompany(req.user.companyId, table.floorId);

  await TableModel.deleteOne({ _id: new mongoose.Types.ObjectId(tableId), companyId: req.user.companyId });

  return { message: "Table deleted successfully" };
};

export const listTables = async (req: RequestWithUser) => {
  const { floorId, outletId } = req.query as any;
  const { isOccupied } = req.query as any;
  const isActiveQuery = (req.query as any).isActive as string | undefined;

  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  const filter: any = { companyId: req.user.companyId };
  if (floorId) {
    assertValidObjectId(floorId as string, "floorId");
    await ensureFloorUnderCompany(req.user.companyId, floorId as string);
    filter.floorId = floorId;
  }
  if (outletId) {
    assertValidObjectId(outletId as string, "outletId");
    await ensureOutletUnderCompany(req.user.companyId, outletId as string);
    filter.outletId = outletId;
  }
  if (isActiveQuery) {
    if (!["active", "inactive"].includes(isActiveQuery)) throw utils.createError(400, "Invalid isActive filter");
    filter.isActive = isActiveQuery === "active";
  }
  if (isOccupied !== undefined) {
    filter.isOccupied = (isOccupied + "").toLowerCase() === "true";
  }

  const { page, limit, skip } = getPaginationParams(req as any);
  const allowAllResponse = ((req.query as any).allowAllResponse + "").toLowerCase() === "true";
  const total = await TableModel.countDocuments(filter);
  const baseQuery = TableModel.find(filter)
    .sort({ displayOrder: 1 })
    .populate("floorId")
    .populate("companyId")
    .populate("brandId")
    .populate("outletId");
  const tables = allowAllResponse ? await baseQuery : await baseQuery.skip(skip).limit(limit);

  // Get all open orders with tableIds to determine actual occupancy
  const openOrders = await OrderModel.find({
    companyId: req.user.companyId,
    status: OrderStatus.OPEN,
    "dineIn.tableId": { $exists: true, $ne: null },
  }).select("dineIn.tableId");

  // Create a set of occupied table IDs
  const occupiedTableIds = new Set(openOrders.map((order) => order.dineIn?.tableId?.toString()).filter(Boolean));

  const data = tables.map((t) => {
    const tableId = t._id.toString();
    const isCurrentlyOccupied = occupiedTableIds.has(tableId);

    return {
      _id: t._id,
      name: t.name,
      seatCapacity: t.seatCapacity,
      displayOrder: t.displayOrder,
      isActive: t.isActive,
      isOccupied: isCurrentlyOccupied,
      status: isCurrentlyOccupied ? "busy" : "available",
      floorId: t.floorId,
      companyId: t.companyId,
      brandId: t.brandId,
      outletId: t.outletId,
    };
  });
  return buildPagedResponse(data, allowAllResponse ? 1 : page, allowAllResponse ? total : limit, total);
};
