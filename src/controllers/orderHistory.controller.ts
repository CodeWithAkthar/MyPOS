import mongoose from "mongoose";
import { RequestWithUser } from "../types/utils";
import Utils from "../utils";
import OrderModel from "../models/order";
import { OrderStatus } from "../types/order";
import { UserRole } from "../types/user";
import { getBusinessDayDataInternal } from "./businessDay.controller";
import OutletsModel from "../models/outlets";

const utils = new Utils();

// ============================================
// ORDER HISTORY - Get order history with filters and pagination
// ============================================

export const getOrderHistory = async (req: RequestWithUser) => {
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company");
  }

  const { outletId, fromDate, toDate, search, orderType, orderStatus, minAmount, maxAmount, page = "1", limit = "10" } = req.query;

  // Validate required outlet
  if (!outletId) {
    throw utils.createError(400, "outletId is required");
  }

  if (!mongoose.Types.ObjectId.isValid(outletId as string)) {
    throw utils.createError(400, "Invalid outletId");
  }

  // Validate orderStatus if provided
  if (orderStatus && !Object.values(OrderStatus).includes(orderStatus as OrderStatus)) {
    throw utils.createError(400, `Invalid orderStatus. Must be one of: ${Object.values(OrderStatus).join(", ")}`);
  }

  // Validate amount filters if provided
  const minAmountNum = minAmount ? parseFloat(minAmount as string) : undefined;
  const maxAmountNum = maxAmount ? parseFloat(maxAmount as string) : undefined;

  if (minAmountNum !== undefined && (isNaN(minAmountNum) || minAmountNum < 0)) {
    throw utils.createError(400, "Invalid minAmount. Must be a non-negative number");
  }

  if (maxAmountNum !== undefined && (isNaN(maxAmountNum) || maxAmountNum < 0)) {
    throw utils.createError(400, "Invalid maxAmount. Must be a non-negative number");
  }

  if (minAmountNum !== undefined && maxAmountNum !== undefined && minAmountNum > maxAmountNum) {
    throw utils.createError(400, "minAmount cannot be greater than maxAmount");
  }

  // Parse pagination parameters
  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);

  // Validate pagination parameters
  if (isNaN(pageNum) || pageNum < 1) {
    throw utils.createError(400, "Invalid page number");
  }
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    throw utils.createError(400, "Invalid limit. Must be between 1 and 100");
  }

  const skip = (pageNum - 1) * limitNum;

  // Get outlet timezone
  const outlet = await OutletsModel.findOne({ _id: outletId, companyId: req.user.companyId });
  if (!outlet) {
    throw utils.createError(404, "Outlet not found");
  }
  const outletTimeZone = outlet.timeZone || "UTC";

  // Get business day data using the same structure as sales.controller.ts
  let businessDayIds: string[] = [];

  const businessDayData = await getBusinessDayDataInternal(req.user.companyId, outletId as string, {
    startDate: fromDate as string,
    endDate: toDate as string,
    timezone: outletTimeZone,
  });

  if (!businessDayData) {
    throw utils.createError(400, "No business day data found for the given date range");
  }

  // Extract business day IDs
  if (Array.isArray(businessDayData)) {
    businessDayIds = businessDayData.map((bd: any) => bd._id.toString());
  } else if (businessDayData && businessDayData._id) {
    businessDayIds = [businessDayData._id.toString()];
  } else {
    throw utils.createError(400, "Invalid business day data format");
  }

  // Build match filter
  const matchFilter: any = {
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    outletId: new mongoose.Types.ObjectId(outletId as string),
    businessDayId: { $in: businessDayIds.map((id) => new mongoose.Types.ObjectId(id)) },
  };

  // Add orderStatus filter if provided
  if (orderStatus) {
    matchFilter.status = orderStatus;
  }

  // Add amount range filter if provided
  if (minAmountNum !== undefined || maxAmountNum !== undefined) {
    matchFilter.netAmount = {};
    if (minAmountNum !== undefined) {
      matchFilter.netAmount.$gte = minAmountNum;
    }
    if (maxAmountNum !== undefined) {
      matchFilter.netAmount.$lte = maxAmountNum;
    }
  }

  // Add exact amount filter if provided (overrides range if both present, or works alongside)
  // User requested "search by 200 then show all the order by 200"
  const { amount } = req.query;
  if (amount) {
    const amountNum = parseFloat(amount as string);
    if (!isNaN(amountNum)) {
      matchFilter.netAmount = amountNum;
    }
  }

  // Role-based visibility: waiters see only their own orders
  if (req.user?.role === UserRole.WAITER && req.user?._id) {
    matchFilter.orderTakenBy = new mongoose.Types.ObjectId(req.user._id);
  }

  // Build aggregation pipeline
  const pipeline: any[] = [
    { $match: matchFilter },
    // Lookup order type
    {
      $lookup: {
        from: "order_types",
        localField: "orderTypeId",
        foreignField: "_id",
        as: "orderType",
      },
    },
    { $unwind: { path: "$orderType", preserveNullAndEmptyArrays: true } },
    // Lookup table info
    {
      $lookup: {
        from: "tables",
        localField: "dineIn.tableId",
        foreignField: "_id",
        as: "table",
      },
    },
    { $unwind: { path: "$table", preserveNullAndEmptyArrays: true } },
    // Lookup order taken by user
    {
      $lookup: {
        from: "users",
        localField: "orderTakenBy",
        foreignField: "_id",
        as: "takenByUser",
      },
    },
    { $unwind: { path: "$takenByUser", preserveNullAndEmptyArrays: true } },
    // Lookup business day
    {
      $lookup: {
        from: "business_days",
        localField: "businessDayId",
        foreignField: "_id",
        as: "businessDay",
      },
    },
    { $unwind: { path: "$businessDay", preserveNullAndEmptyArrays: true } },
    // Project fields
    {
      $project: {
        orderNumber: 1,
        orderType: "$orderType.type",
        orderDate: "$createdAt",
        businessDate: "$businessDay.startedAt",
        tableNumber: {
          $cond: {
            if: { $ifNull: ["$table.tableNumber", false] },
            then: "$table.tableNumber",
            else: null,
          },
        },
        tableName: {
          $cond: {
            if: { $ifNull: ["$dineIn.tableName", false] },
            then: "$dineIn.tableName",
            else: null,
          },
        },
        customer: {
          $cond: {
            if: { $ifNull: ["$delivery.customerName", false] },
            then: "$delivery.customerName",
            else: null,
          },
        },
        customerPhone: {
          $cond: {
            if: { $ifNull: ["$delivery.phone", false] },
            then: "$delivery.phone",
            else: null,
          },
        },
        orderBy: "$takenByUser.name",
        orderTakenById: "$orderTakenBy",
        status: 1,
        amount: "$netAmount",
        createdAt: 1,
      },
    },
  ];

  // Add search filter if provided
  if (search && typeof search === "string" && search.trim() !== "") {
    const searchRegex = new RegExp(search, "i");
    const searchNumber = parseFloat(search);

    pipeline.push({
      $match: {
        $or: [
          // Search by order number (exact match)
          ...(!isNaN(searchNumber) ? [{ orderNumber: searchNumber }] : []),
          // Search by amount (exact match)
          ...(!isNaN(searchNumber) ? [{ amount: searchNumber }] : []),
          // Search by customer name
          { customer: searchRegex },
          // Search by table name
          { tableName: searchRegex },
          // Search by order taken by
          { orderBy: searchRegex },
          // Search by order type
          { orderType: searchRegex },
          // Search by order status
          { status: searchRegex },
        ],
      },
    });
  }

  // Add orderType filter if provided (after projection since orderType comes from lookup)
  if (orderType && typeof orderType === "string" && orderType.trim() !== "") {
    const orderTypeRegex = new RegExp(orderType.trim(), "i");
    pipeline.push({
      $match: {
        orderType: orderTypeRegex,
      },
    });
  }

  // Sort by order date descending (most recent first)
  pipeline.push({ $sort: { createdAt: -1 } });

  // Add facet for pagination
  pipeline.push({
    $facet: {
      metadata: [{ $count: "total" }],
      data: [{ $skip: skip }, { $limit: limitNum }],
    },
  });

  // Execute aggregation
  const result = await OrderModel.aggregate(pipeline);

  const total = result[0]?.metadata[0]?.total || 0;
  const orders = result[0]?.data || [];

  // Format response
  const formattedOrders = orders.map((order: any, index: number) => ({
    sNo: skip + index + 1,
    orderNo: order.orderNumber,
    orderType: order.orderType || "N/A",
    orderDate: order.orderDate,
    businessDate: order.businessDate || null,
    tableNo: order.tableNumber || order.tableName || "N/A",
    customer: order.customer || "N/A",
    orderBy: order.orderBy || "N/A",
    orderStatus: order.status,
    amount: Number(order.amount?.toFixed(2) || 0),
    orderId: order?._id,
    _id: order?._id,
  }));

  return {
    data: formattedOrders,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum,
    },
  };
};
