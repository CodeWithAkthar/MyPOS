import mongoose from "mongoose";
import { RequestWithUser } from "../types/utils";
import Utils from "../utils";
import OrderModel from "../models/order";
import TableModel from "../models/table";
import UserModel from "../models/user";
import ExpenseModel from "../models/expense";
import { DiscountType, OrderStatus, PaymentStatus } from "../types/order";
import OrderTypeModel from "../models/orderType";
import OutletsModel from "../models/outlets";
import { getBusinessDayDataInternal } from "./businessDay.controller";
import { UserRole } from "../types/user";

const utils = new Utils();

// ============================================
// DATE UTILITY HELPERS (UTC)
// ============================================

/**
 * Parse date string and return start of day in UTC
 */
const parseStartOfDayUTC = (dateString: string): Date => {
  const parsed = new Date(dateString);
  if (isNaN(parsed.getTime())) {
    throw new Error("Invalid date format");
  }
  // If the string includes time information, use it as-is
  if (dateString.length > 10) {
    return parsed;
  }
  // Otherwise, set to start of day in UTC
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 0, 0, 0, 0));
};

/**
 * Parse date string and return end of day in UTC
 */
const parseEndOfDayUTC = (dateString: string): Date => {
  const parsed = new Date(dateString);
  if (isNaN(parsed.getTime())) {
    throw new Error("Invalid date format");
  }
  // If the string includes time information, use it as-is
  if (dateString.length > 10) {
    return parsed;
  }
  // Otherwise, set to end of day in UTC
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 23, 59, 59, 999));
};

/**
 * Get current date at start of day in UTC
 */
const getCurrentStartOfDayUTC = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
};

/**
 * Get current date at end of day in UTC
 */
const getCurrentEndOfDayUTC = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
};

// ============================================
// VALIDATION HELPERS
// ============================================

class OrderValidator {
  static validateObjectId(id: string, fieldName: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw utils.createError(400, `Invalid ${fieldName}`);
    }
  }

  static validateRequiredField(value: any, fieldName: string): void {
    if (!value) {
      throw utils.createError(400, `${fieldName} is required`);
    }
  }

  static validateArray(value: any, fieldName: string): void {
    if (!Array.isArray(value)) {
      throw utils.createError(400, `${fieldName} must be an array`);
    }
  }

  static validateOrderStatus(status: string): void {
    if (!Object.values(OrderStatus).includes(status as OrderStatus)) {
      throw utils.createError(400, "Invalid order status");
    }
  }

  static validatePaymentStatus(status: string): void {
    if (!Object.values(PaymentStatus).includes(status as PaymentStatus)) {
      throw utils.createError(400, "Invalid payment status");
    }
  }

  static validateDiscount(discount: any, totalAmount: number): void {
    if (!discount) return;

    const { discountType, discountValue } = discount;

    if (!discountType || !Object.values(DiscountType).includes(discountType)) {
      throw utils.createError(400, "Invalid discount type");
    }

    if (discountValue === undefined || discountValue === null || discountValue < 0) {
      throw utils.createError(400, "Discount value must be a non-negative number");
    }

    if (discountType === DiscountType.PERCENTAGE) {
      if (discountValue > 100) {
        throw utils.createError(400, "Percentage discount cannot exceed 100%");
      }
    }

    if (discountType === DiscountType.AMOUNT) {
      if (discountValue > totalAmount) {
        throw utils.createError(400, "Discount amount cannot exceed total amount");
      }
    }
  }

  static validatePaymentAmounts(amounts: { upi?: number; card?: number; cash?: number }): void {
    const { upi = 0, card = 0, cash = 0 } = amounts;

    if (upi < 0 || card < 0 || cash < 0) {
      throw utils.createError(400, "Payment amounts cannot be negative");
    }

    if (!Number.isFinite(upi) || !Number.isFinite(card) || !Number.isFinite(cash)) {
      throw utils.createError(400, "Payment amounts must be valid numbers");
    }
  }

  static async validateOutletAccess(outletId: string, companyId: string): Promise<any> {
    this.validateObjectId(outletId, "outletId");
    const outlet = await OutletsModel.findOne({ _id: outletId, companyId });
    if (!outlet) {
      throw utils.createError(404, "Outlet not found in your company");
    }
    return outlet;
  }

  static async validateOrderTypeAccess(orderTypeId: string, companyId: string, outletId: string): Promise<any> {
    this.validateObjectId(orderTypeId, "orderTypeId");
    const orderType = await OrderTypeModel.findOne({
      _id: orderTypeId,
      companyId,
      outletId,
    });
    if (!orderType) {
      throw utils.createError(404, "Order type not found for this outlet");
    }
    return orderType;
  }
}

// ============================================
// SALES REPORT - Dashboard analytics
// ============================================

export const getSalesReport = async (req: RequestWithUser) => {
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company");
  }

  const { outletId, fromDate, toDate } = req.query as any;

  // Validate required outlet
  OrderValidator.validateRequiredField(outletId, "outletId");
  const outlet = await OrderValidator.validateOutletAccess(outletId as string, req.user.companyId);

  // Get outlet timezone
  const outletTimeZone = outlet.timeZone || "UTC";

  // Get business day data using the same structure as other reports
  let businessDayIds: string[] = [];

  const businessDayData = await getBusinessDayDataInternal(req.user.companyId, outletId as string, {
    startDate: fromDate as string,
    endDate: toDate as string,
    timezone: outletTimeZone, // Pass outlet timezone for accurate date matching
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

  // ============================================
  // SALES TODAY - Closed orders that have been settled (paid)
  // ============================================
  const salesTodayAggregation = await OrderModel.aggregate([
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(req.user.companyId),
        outletId: new mongoose.Types.ObjectId(outletId as string),
        businessDayId: { $in: businessDayIds.map((id) => new mongoose.Types.ObjectId(id)) },
        status: OrderStatus.CLOSED, // Only CLOSED orders count as completed sales
        paymentStatus: PaymentStatus.SETTLED, // Only SETTLED orders count as paid
        ...(req.user?.role === UserRole.WAITER && req.user?._id ? { orderTakenBy: new mongoose.Types.ObjectId(req.user._id) } : {}),
      },
    },
    {
      $group: {
        _id: null,
        totalSales: { $sum: "$netAmount" },
        orders: { $sum: 1 },
      },
    },
  ]);

  const salesToday =
    salesTodayAggregation.length > 0
      ? {
          totalSales: Number(salesTodayAggregation[0].totalSales.toFixed(2)),
          orders: salesTodayAggregation[0].orders,
        }
      : {
          totalSales: 0,
          orders: 0,
        };

  // ============================================
  // ORDER STATUS COUNTS
  // ============================================
  const orderStatusAggregation = await OrderModel.aggregate([
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(req.user.companyId),
        outletId: new mongoose.Types.ObjectId(outletId as string),
        businessDayId: { $in: businessDayIds.map((id) => new mongoose.Types.ObjectId(id)) },
        ...(req.user?.role === UserRole.WAITER && req.user?._id ? { orderTakenBy: new mongoose.Types.ObjectId(req.user._id) } : {}),
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  // Map order status counts
  const orderStatusMap = new Map(orderStatusAggregation.map((item) => [item._id, item.count]));

  const orders = {
    pending: orderStatusMap.get(OrderStatus.OPEN) || 0,
    closed: orderStatusMap.get(OrderStatus.CLOSED) || 0,
    cancelled: orderStatusMap.get(OrderStatus.CANCELLED) || 0,
  };

  // ============================================
  // ACTIVE TABLES
  // ============================================
  // Count tables with active orders (dine-in orders that are still open) - these are BUSY tables
  const busyTableIds = await OrderModel.distinct("dineIn.tableId", {
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    outletId: new mongoose.Types.ObjectId(outletId as string),
    businessDayId: { $in: businessDayIds.map((id) => new mongoose.Types.ObjectId(id)) },
    status: OrderStatus.OPEN,
    "dineIn.tableId": { $exists: true, $ne: null },
    ...(req.user?.role === UserRole.WAITER && req.user?._id ? { orderTakenBy: new mongoose.Types.ObjectId(req.user._id) } : {}),
  });

  const busyTablesCount = busyTableIds.length;

  // Get total tables for the outlet
  const totalTables = await TableModel.countDocuments({
    companyId: req.user.companyId,
    outletId: outletId as string,
    isActive: true,
  });

  // Calculate available tables (active = not occupied/busy)
  const availableTablesCount = totalTables - busyTablesCount;

  const activeTables = {
    busy: busyTablesCount, // Tables with open orders (occupied)
    available: availableTablesCount, // Tables without open orders (not occupied)
    total: totalTables, // Total active tables in outlet
  };

  // ============================================
  // EMPLOYEES
  // ============================================
  // Get employees who have taken orders during the business day (currently working)
  const currentlyWorkingEmployees = await OrderModel.distinct("orderTakenBy", {
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    outletId: new mongoose.Types.ObjectId(outletId as string),
    businessDayId: { $in: businessDayIds.map((id) => new mongoose.Types.ObjectId(id)) },
    orderTakenBy: { $exists: true, $ne: null },
    ...(req.user?.role === UserRole.WAITER && req.user?._id ? { orderTakenBy: new mongoose.Types.ObjectId(req.user._id) } : {}),
  });

  // Get total active employees for the outlet
  const totalEmployees = await UserModel.countDocuments({
    companyId: req.user.companyId,
    outletId: outletId as string,
    isActive: true,
  });

  const employees = {
    currentlyWorking: currentlyWorkingEmployees.length,
    totalEmployees,
  };

  // ============================================
  // RETURN REPORT
  // ============================================
  return {
    salesToday,
    orders,
    activeTables,
    employees,
  };
};

// ============================================
// DAILY SALES REPORT - Comprehensive daily analytics
// ============================================

export const getDailySalesReport = async (req: RequestWithUser) => {
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company");
  }

  const { outletId, fromDate, toDate } = req.query;

  // Validate required outlet and get outlet data with timezone
  OrderValidator.validateRequiredField(outletId, "outletId");
  const outlet = await OrderValidator.validateOutletAccess(outletId as string, req.user.companyId);

  // Get outlet timezone
  const outletTimeZone = outlet.timeZone || "UTC";

  let businessDayData: any = null;
  let businessDayId: string | null = null;
  let startOfDay: Date;
  let endOfDay: Date;

  businessDayData = await getBusinessDayDataInternal(req.user.companyId, outletId as string, {
    startDate: fromDate as string,
    // endDate: toDate as string,
    timezone: outletTimeZone, // Pass outlet timezone for accurate date matching
  });

  if (businessDayData) {
    startOfDay = new Date(businessDayData.startedAt);
    endOfDay = businessDayData.endedAt ? new Date(businessDayData.endedAt) : new Date();
    businessDayId = businessDayData?.[0]?._id || businessDayData?._id + "";
  } else {
    throw utils.createError(400, "No business day data found for the given date range");
  }

  // Base match filter for settled orders
  const baseMatch: any = {
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    outletId: new mongoose.Types.ObjectId(outletId as string),
    paymentStatus: PaymentStatus.SETTLED,
    status: OrderStatus.CLOSED,
  };

  // Role-based visibility: waiters see only their own orders
  if (req.user?.role === UserRole.WAITER && req.user?._id) {
    baseMatch.orderTakenBy = new mongoose.Types.ObjectId(req.user._id);
  }

  // Use businessDayId if available, otherwise fall back to date range
  if (businessDayId) {
    baseMatch.businessDayId = new mongoose.Types.ObjectId(businessDayId);
  } else {
    baseMatch.createdAt = { $gte: startOfDay, $lte: endOfDay };
  }

  // ============================================
  // SALES BY CATEGORY
  // ============================================
  const categorySalesAgg = await OrderModel.aggregate([
    { $match: baseMatch },
    { $unwind: "$items" },
    {
      $match: {
        "items.isVoid": { $ne: true },
      },
    },
    {
      $lookup: {
        from: "menu_items",
        localField: "items.itemId",
        foreignField: "_id",
        as: "menuItem",
      },
    },
    { $unwind: { path: "$menuItem", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "menu_categories",
        localField: "menuItem.categoryId",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: "$category._id",
        categoryName: { $first: "$category.name" },
        qty: { $sum: "$items.quantity" },
        sales: { $sum: "$items.totalAmount" },
      },
    },
    { $sort: { categoryName: 1 } },
  ]);

  const totalCategorySales = categorySalesAgg.reduce(
    (acc, item) => ({
      totalQty: acc.totalQty + item.qty,
      totalSales: acc.totalSales + item.sales,
    }),
    { totalQty: 0, totalSales: 0 },
  );

  const category = {
    data: categorySalesAgg.map((item) => ({
      categoryName: item.categoryName || "Uncategorized",
      qty: item.qty,
      sales: Number(item.sales.toFixed(2)),
    })),
    totalCategorySales: {
      totalQty: totalCategorySales.totalQty,
      totalSales: Number(totalCategorySales.totalSales.toFixed(2)),
    },
  };

  // ============================================
  // SALES BY ITEM
  // ============================================
  const itemSalesAgg = await OrderModel.aggregate([
    { $match: baseMatch },
    { $unwind: "$items" },
    {
      $match: {
        "items.isVoid": { $ne: true },
      },
    },
    {
      $group: {
        _id: "$items.itemId",
        itemName: { $first: "$items.name" },
        qty: { $sum: "$items.quantity" },
        sales: { $sum: "$items.totalAmount" },
      },
    },
    { $sort: { itemName: 1 } },
  ]);

  const totalItemSales = itemSalesAgg.reduce(
    (acc, item) => ({
      totalQty: acc.totalQty + item.qty,
      totalSales: acc.totalSales + item.sales,
    }),
    { totalQty: 0, totalSales: 0 },
  );

  const salesByItem = {
    data: itemSalesAgg.map((item) => ({
      item: item.itemName || "Unknown Item",
      qty: item.qty,
      sales: Number(item.sales.toFixed(2)),
    })),
    totalItemSales: {
      totalQty: totalItemSales.totalQty,
      totalSales: Number(totalItemSales.totalSales.toFixed(2)),
    },
  };

  // ============================================
  // SALES BY ORDER TYPE
  // ============================================
  const orderTypeSalesAgg = await OrderModel.aggregate([
    { $match: baseMatch },
    {
      $lookup: {
        from: "order_types",
        localField: "orderTypeId",
        foreignField: "_id",
        as: "orderType",
      },
    },
    { $unwind: { path: "$orderType", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: "$orderTypeId",
        orderTypeName: { $first: "$orderType.type" },
        qty: { $sum: 1 },
        sales: { $sum: "$netAmount" },
      },
    },
    { $sort: { orderTypeName: 1 } },
  ]);

  const totalOrderTypeSales = orderTypeSalesAgg.reduce(
    (acc, item) => ({
      totalQty: acc.totalQty + item.qty,
      totalSales: acc.totalSales + item.sales,
    }),
    { totalQty: 0, totalSales: 0 },
  );

  const salesByOrderType = {
    data: orderTypeSalesAgg.map((item) => ({
      orderType: item.orderTypeName || "Unknown",
      qty: item.qty,
      sales: Number(item.sales.toFixed(2)),
    })),
    totalSales: {
      totalQty: totalOrderTypeSales.totalQty,
      totalSales: Number(totalOrderTypeSales.totalSales.toFixed(2)),
    },
  };

  // ============================================
  // SALES BY PAYMENT TYPE
  // ============================================
  const paymentTypeSalesAgg = await OrderModel.aggregate([
    { $match: baseMatch },
    {
      $project: {
        cash: { $ifNull: ["$paymentSettlement.cash", 0] },
        upi: { $ifNull: ["$paymentSettlement.upi", 0] },
        card: { $ifNull: ["$paymentSettlement.card", 0] },
      },
    },
    {
      $group: {
        _id: null,
        cashTransactions: {
          $sum: { $cond: [{ $gt: ["$cash", 0] }, 1, 0] },
        },
        cashSales: { $sum: "$cash" },
        upiTransactions: {
          $sum: { $cond: [{ $gt: ["$upi", 0] }, 1, 0] },
        },
        upiSales: { $sum: "$upi" },
        cardTransactions: {
          $sum: { $cond: [{ $gt: ["$card", 0] }, 1, 0] },
        },
        cardSales: { $sum: "$card" },
      },
    },
  ]);

  const paymentData = paymentTypeSalesAgg[0] || {
    cashTransactions: 0,
    cashSales: 0,
    upiTransactions: 0,
    upiSales: 0,
    cardTransactions: 0,
    cardSales: 0,
  };

  const salesByPaymentType = {
    data: [
      {
        type: "cash",
        transactions: paymentData.cashTransactions,
        sales: Number(paymentData.cashSales.toFixed(2)),
      },
      {
        type: "upi",
        transactions: paymentData.upiTransactions,
        sales: Number(paymentData.upiSales.toFixed(2)),
      },
      {
        type: "card",
        transactions: paymentData.cardTransactions,
        sales: Number(paymentData.cardSales.toFixed(2)),
      },
    ],
    totalSales: {
      totalTransactions: paymentData.cashTransactions + paymentData.upiTransactions + paymentData.cardTransactions,
      totalSales: Number((paymentData.cashSales + paymentData.upiSales + paymentData.cardSales).toFixed(2)),
    },
  };

  // ============================================
  // HOURLY SALES (2-hour intervals)
  // ============================================

  const hourlySalesAgg = await OrderModel.aggregate([
    { $match: baseMatch },
    {
      $project: {
        // Extract hour in outlet's timezone
        hour: { $hour: { date: "$createdAt", timezone: outletTimeZone } },
        netAmount: 1,
      },
    },
    {
      $group: {
        _id: "$hour",
        transactions: { $sum: 1 },
        sales: { $sum: "$netAmount" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Group into 2-hour intervals
  const hourlyIntervals = ["0-2", "2-4", "4-6", "6-8", "8-10", "10-12", "12-14", "14-16", "16-18", "18-20", "20-22", "22-24"];

  const hourlySalesMap = new Map();
  hourlyIntervals.forEach((interval) => {
    hourlySalesMap.set(interval, { transactions: 0, sales: 0 });
  });

  hourlySalesAgg.forEach((item) => {
    const intervalIndex = Math.floor(item._id / 2);
    const interval = hourlyIntervals[intervalIndex];
    if (interval) {
      const current = hourlySalesMap.get(interval);
      hourlySalesMap.set(interval, {
        transactions: current.transactions + item.transactions,
        sales: current.sales + item.sales,
      });
    }
  });

  const hourlySalesData = Array.from(hourlySalesMap.entries()).map(([hour, data]) => ({
    hour,
    transactions: data.transactions,
    sales: Number(data.sales.toFixed(2)),
  }));

  const totalHourlySales = hourlySalesData.reduce(
    (acc, item) => ({
      totalTransactions: acc.totalTransactions + item.transactions,
      totalSales: acc.totalSales + item.sales,
    }),
    { totalTransactions: 0, totalSales: 0 },
  );

  const hourlySales = {
    data: hourlySalesData,
    totalSales: {
      totalTransactions: totalHourlySales.totalTransactions,
      totalSales: Number(totalHourlySales.totalSales.toFixed(2)),
    },
  };

  // ============================================
  // VOID TYPE (Item Void & Order Void)
  // ============================================
  // Create base match for void queries
  const voidBaseMatch: any = {
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    outletId: new mongoose.Types.ObjectId(outletId as string),
  };

  if (req.user?.role === UserRole.WAITER && req.user?._id) {
    voidBaseMatch.orderTakenBy = new mongoose.Types.ObjectId(req.user._id);
  }

  if (businessDayId) {
    voidBaseMatch.businessDayId = new mongoose.Types.ObjectId(businessDayId as string);
  } else {
    voidBaseMatch.createdAt = { $gte: startOfDay, $lte: endOfDay };
  }

  // Item voids
  const itemVoidAgg = await OrderModel.aggregate([
    { $match: voidBaseMatch },
    { $unwind: "$items" },
    {
      $match: {
        "items.isVoid": true,
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        total: { $sum: "$items.totalAmount" },
      },
    },
  ]);

  // Order voids (cancelled orders)
  const orderVoidAgg = await OrderModel.aggregate([
    {
      $match: {
        ...voidBaseMatch,
        status: OrderStatus.CANCELLED,
        paymentStatus: { $ne: PaymentStatus.SETTLED },
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        total: { $sum: "$netAmount" },
      },
    },
  ]);

  const itemVoidData = itemVoidAgg[0] || { count: 0, total: 0 };
  const orderVoidData = orderVoidAgg[0] || { count: 0, total: 0 };

  const voidType = {
    data: [
      {
        type: "itemVoid",
        count: itemVoidData.count,
        total: Number(itemVoidData.total.toFixed(2)),
      },
      {
        type: "orderVoid",
        count: orderVoidData.count,
        total: Number(orderVoidData.total.toFixed(2)),
      },
    ],
    totalVoids: {
      totalCount: itemVoidData.count + orderVoidData.count,
      totalAmount: Number((itemVoidData.total + orderVoidData.total).toFixed(2)),
    },
  };

  // ============================================
  // WAITER SALES
  // ============================================
  const waiterSalesAgg = await OrderModel.aggregate([
    { $match: baseMatch },
    {
      $lookup: {
        from: "users",
        localField: "orderTakenBy",
        foreignField: "_id",
        as: "waiter",
      },
    },
    { $unwind: { path: "$waiter", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: "$orderTakenBy",
        name: { $first: "$waiter.name" },
        total: { $sum: "$netAmount" },
      },
    },
    { $sort: { name: 1 } },
  ]);

  const totalWaiterSales = waiterSalesAgg.reduce((acc, item) => acc + item.total, 0);

  const waiterSales = {
    data: waiterSalesAgg.map((item) => ({
      name: item.name || "Unknown",
      total: Number(item.total.toFixed(2)),
    })),
    totalSales: {
      totalSales: Number(totalWaiterSales.toFixed(2)),
    },
  };

  // ============================================
  // BANKING INFO
  // ============================================
  const bankingInfoAgg = await OrderModel.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: null,
        totalSales: { $sum: "$totalAmount" },
        discounts: { $sum: { $ifNull: ["$discount.discountAmount", 0] } },
        deliveryCharge: { $sum: { $ifNull: ["$deliveryCharges", 0] } },
        netSales: { $sum: "$netAmount" },
      },
    },
  ]);

  const bankingData = bankingInfoAgg[0] || {
    totalSales: 0,
    discounts: 0,
    deliveryCharge: 0,
    netSales: 0,
    variance: 0,
  };

  // Calculate total variance from business days
  let totalVariance = 0;
  if (businessDayData) {
    if (Array.isArray(businessDayData)) {
      totalVariance = businessDayData.reduce((acc: number, curr: any) => acc + (curr.variance || 0), 0);
    } else {
      totalVariance = businessDayData.variance || 0;
    }
  }

  // Get expenses for the business day
  let totalExpense = 0;
  if (businessDayId) {
    const expenseAgg = await ExpenseModel.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(req.user.companyId),
          outletId: new mongoose.Types.ObjectId(outletId as string),
          businessDayId: new mongoose.Types.ObjectId(businessDayId),
        },
      },
      {
        $group: {
          _id: null,
          totalExpense: { $sum: "$amount" },
        },
      },
    ]);
    totalExpense = expenseAgg[0]?.totalExpense || 0;
  }

  // Use aggregated delivery charge
  const deliveryCharge = bankingData.deliveryCharge;

  // Gross sales = total sales + delivery charge
  const grossSales = bankingData.totalSales + deliveryCharge;

  // Net total = net sales - expenses (final profit/loss)
  const netTotal = bankingData.netSales - totalExpense;

  const bankingInfo = {
    totalSales: Number(bankingData.totalSales.toFixed(2)),
    variance: Number(totalVariance.toFixed(2)),
    remarks: businessDayData?.remarks || null,
    data: [
      {
        type: "totalSales",
        total: Number(bankingData.totalSales.toFixed(2)),
      },
      {
        type: "deliveryCharge",
        total: Number(deliveryCharge.toFixed(2)),
      },
      {
        type: "grossSales",
        total: Number(grossSales.toFixed(2)),
      },
      {
        type: "discounts",
        total: Number(bankingData.discounts.toFixed(2)),
      },
      {
        type: "netSales",
        total: Number(bankingData.netSales.toFixed(2)),
      },
      {
        type: "variance",
        total: Number(totalVariance.toFixed(2)),
      },
      {
        type: "expense",
        total: Number(totalExpense.toFixed(2)),
      },
      {
        type: "netTotal",
        total: Number(netTotal.toFixed(2)),
      },
    ],
  };

  // ============================================
  // RETURN COMPLETE REPORT
  // ============================================
  return {
    businessDayId: businessDayId?.toString() || null,
    dateRange: {
      startDate: startOfDay,
      endDate: endOfDay,
    },
    category,
    salesByItem,
    salesByOrderType,
    salesByPaymentType,
    hourlySales,
    voidType,
    waiterSales,
    bankingInfo,
  };
};

// ============================================
// ITEM SALES REPORT - Sales by item
// ============================================

export const getItemReport = async (req: RequestWithUser) => {
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company");
  }

  const { outletId, fromDate, toDate, page = "1", limit = "10" } = req.query;

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

  // Validate required outlet
  OrderValidator.validateRequiredField(outletId, "outletId");
  const outlet = await OrderValidator.validateOutletAccess(outletId as string, req.user.companyId);

  // Get outlet timezone
  const outletTimeZone = outlet.timeZone || "UTC";

  // Get date range: prefer business day; fallback to calendar day
  let startOfDay: Date;
  let endOfDay: Date;

  const businessDayData = await getBusinessDayDataInternal(req.user.companyId, outletId as string, {
    startDate: fromDate as string,
    endDate: toDate as string,
    timezone: outletTimeZone, // Pass outlet timezone for accurate date matching
  });

  if (businessDayData) {
    startOfDay = new Date(businessDayData.startedAt);
    endOfDay = businessDayData.endedAt ? new Date(businessDayData.endedAt) : new Date();
  } else {
    throw utils.createError(400, "No business day data found for the given date range");
  }

  // Validate date range
  if (startOfDay > endOfDay) {
    throw utils.createError(400, "fromDate cannot be greater than toDate");
  }

  // Base match filter for settled orders
  const baseMatch = {
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    outletId: new mongoose.Types.ObjectId(outletId as string),
    businessDayId: { $in: [...(businessDayData?.map?.((e) => e?._id) || [])] },
    paymentStatus: PaymentStatus.SETTLED,
    status: OrderStatus.CLOSED,
  };

  if (req.user?.role === UserRole.WAITER && req.user?._id) {
    (baseMatch as any).orderTakenBy = new mongoose.Types.ObjectId(req.user._id);
  }
  // ============================================
  // SALES BY ITEM
  // ============================================
  const itemSalesAgg = await OrderModel.aggregate([
    { $match: baseMatch },
    { $unwind: "$items" },
    {
      $match: {
        "items.isVoid": { $ne: true },
      },
    },
    {
      $group: {
        _id: "$items.itemId",
        itemName: { $first: "$items.name" },
        qty: { $sum: "$items.quantity" },
        sales: { $sum: "$items.totalAmount" },
      },
    },
    { $sort: { itemName: 1 } },
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limitNum }],
      },
    },
  ]);

  const result = itemSalesAgg[0];
  const total = result.metadata[0]?.total || 0;
  const items = result.data;

  const totalItemSales = items.reduce(
    (acc, item) => ({
      totalQty: acc.totalQty + item.qty,
      totalSales: acc.totalSales + item.sales,
    }),
    { totalQty: 0, totalSales: 0 },
  );

  return {
    data: items.map((item) => ({
      item: item.itemName || "Unknown Item",
      qty: item.qty,
      sales: Number(item.sales.toFixed(2)),
    })),
    totalItemSales: {
      totalQty: totalItemSales.totalQty,
      totalSales: Number(totalItemSales.totalSales.toFixed(2)),
    },
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum,
    },
  };
};

// ============================================
// TOP SELLING ITEMS REPORT
// ============================================

export const getTopSellingItemsReport = async (req: RequestWithUser) => {
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company");
  }

  const { outletId, fromDate, toDate, page = "1", limit = "10" } = req.query;

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

  // Validate required outlet
  OrderValidator.validateRequiredField(outletId, "outletId");
  const outlet = await OrderValidator.validateOutletAccess(outletId as string, req.user.companyId);

  // Get outlet timezone
  const outletTimeZone = outlet.timeZone || "UTC";

  // Get date range: prefer business day; fallback to calendar day
  let startOfDay: Date;
  let endOfDay: Date;

  const businessDayData = await getBusinessDayDataInternal(req.user.companyId, outletId as string, {
    startDate: fromDate as string,
    endDate: toDate as string,
    timezone: outletTimeZone, // Pass outlet timezone for accurate date matching
  });

  if (businessDayData) {
    startOfDay = new Date(businessDayData.startedAt);
    endOfDay = businessDayData.endedAt ? new Date(businessDayData.endedAt) : new Date();
  } else {
    throw utils.createError(400, "No business day data found for the given date range");
  }

  // Base match filter for settled orders
  const baseMatch = {
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    outletId: new mongoose.Types.ObjectId(outletId as string),
    businessDayId: { $in: [...(businessDayData?.map?.((e: any) => e?._id) || [])] },
    paymentStatus: PaymentStatus.SETTLED,
    status: OrderStatus.CLOSED,
  };

  if (req.user?.role === UserRole.WAITER && req.user?._id) {
    (baseMatch as any).orderTakenBy = new mongoose.Types.ObjectId(req.user._id);
  }

  const topSellingAgg = await OrderModel.aggregate([
    { $match: baseMatch },
    { $unwind: "$items" },
    {
      $match: {
        "items.isVoid": { $ne: true },
      },
    },
    {
      $group: {
        _id: "$items.itemId",
        itemName: { $first: "$items.name" },
        qty: { $sum: "$items.quantity" },
        sales: { $sum: "$items.totalAmount" },
      },
    },
    { $sort: { qty: -1, sales: -1 } },
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limitNum }],
      },
    },
  ]);

  const result = topSellingAgg[0];
  const total = result.metadata[0]?.total || 0;
  const items = result.data;

  return {
    data: items.map((item: any) => ({
      item: item.itemName || "Unknown Item",
      qty: item.qty,
      sales: Number(item.sales.toFixed(2)),
    })),
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum,
    },
  };
};

// ============================================
// CATEGORY SALES REPORT - Sales by category
// ============================================

export const getCategoryReport = async (req: RequestWithUser) => {
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company");
  }

  const { outletId, fromDate, toDate = new Date(), page = "1", limit = "10" } = req.query;

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

  // Validate required outlet
  OrderValidator.validateRequiredField(outletId, "outletId");
  const outlet = await OrderValidator.validateOutletAccess(outletId as string, req.user.companyId);

  // Get outlet timezone
  const outletTimeZone = outlet.timeZone || "UTC";

  // Get date range: prefer business day; fallback to calendar day
  let startOfDay: Date;
  let endOfDay: Date;
  const businessDayData = await getBusinessDayDataInternal(req.user.companyId, outletId as string, {
    startDate: fromDate as string,
    endDate: toDate as string,
    timezone: outletTimeZone, // Pass outlet timezone for accurate date matching
  });

  if (businessDayData) {
    startOfDay = new Date(businessDayData.startedAt);
    endOfDay = businessDayData.endedAt ? new Date(businessDayData.endedAt) : new Date();
  } else {
    throw utils.createError(400, "No business day data found for the given date range");
  }

  // Validate date range
  if (startOfDay > endOfDay) {
    throw utils.createError(400, "fromDate cannot be greater than toDate");
  }

  // Base match filter for settled orders
  const baseMatch = {
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    outletId: new mongoose.Types.ObjectId(outletId as string),
    businessDayId: { $in: [...(businessDayData?.map?.((e: any) => e?._id) || [])] },
    paymentStatus: PaymentStatus.SETTLED,
    status: OrderStatus.CLOSED,
  };

  // ============================================
  // SALES BY CATEGORY
  // ============================================
  const categorySalesAgg = await OrderModel.aggregate([
    { $match: baseMatch },
    { $unwind: "$items" },
    {
      $match: {
        "items.isVoid": { $ne: true },
      },
    },
    {
      $lookup: {
        from: "menu_items",
        localField: "items.itemId",
        foreignField: "_id",
        as: "menuItem",
      },
    },
    { $unwind: { path: "$menuItem", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "menu_categories",
        localField: "menuItem.categoryId",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: "$category._id",
        categoryName: { $first: "$category.name" },
        qty: { $sum: "$items.quantity" },
        sales: { $sum: "$items.totalAmount" },
      },
    },
    { $sort: { categoryName: 1 } },
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limitNum }],
      },
    },
  ]);

  const result = categorySalesAgg[0];
  const total = result.metadata[0]?.total || 0;
  const categories = result.data;

  const totalCategorySales = categories.reduce(
    (acc, item) => ({
      totalQty: acc.totalQty + item.qty,
      totalSales: acc.totalSales + item.sales,
    }),
    { totalQty: 0, totalSales: 0 },
  );

  return {
    data: categories.map((item) => ({
      categoryName: item.categoryName || "Uncategorized",
      qty: item.qty,
      sales: Number(item.sales.toFixed(2)),
    })),
    totalCategorySales: {
      totalQty: totalCategorySales.totalQty,
      totalSales: Number(totalCategorySales.totalSales.toFixed(2)),
    },
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum,
    },
  };
};

// ============================================
// EXPENSE REPORT - Expenses by category with date range
// ============================================

export const getExpenseReport = async (req: RequestWithUser) => {
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company");
  }

  const { outletId, fromDate, toDate, categoryId, page = "1", limit = "10", paymentType } = req.query as any;

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

  // Validate required outlet and get outlet data with timezone
  OrderValidator.validateRequiredField(outletId, "outletId");
  const outlet = await OrderValidator.validateOutletAccess(outletId as string, req.user.companyId);

  // Get outlet timezone
  const outletTimeZone = outlet.timeZone || "UTC";

  // Get date range and business day IDs using shared function for timezone-aware date matching
  let businessDayIds: string[] = [];
  let startDate: Date;
  let endDate: Date;

  // When fromDate === toDate, treat as single date query for better matching
  const isSameDate = fromDate && toDate && fromDate === toDate;

  const businessDayData = await getBusinessDayDataInternal(req.user.companyId, outletId as string, {
    startDate: fromDate as string,
    endDate: isSameDate ? undefined : (toDate as string), // If same date, don't pass endDate
    timezone: outletTimeZone, // Pass outlet timezone for accurate date matching
  });

  if (!businessDayData) {
    throw utils.createError(400, "No business day data found for the given date range");
  }

  // Extract business day IDs and date range
  const businessDayDatas = Array.isArray(businessDayData) ? businessDayData : [businessDayData];

  // Validate we have business days
  if (businessDayDatas.length === 0) {
    throw utils.createError(400, "No business day data found for the given date range");
  }

  businessDayIds = businessDayDatas.map((bd: any) => bd._id.toString());
  startDate = new Date(businessDayDatas[0].startedAt);
  endDate = businessDayDatas[businessDayDatas.length - 1].endedAt
    ? new Date(businessDayDatas[businessDayDatas.length - 1].endedAt)
    : new Date();

  // ============================================
  // FETCH EXPENSES WITH CATEGORY DETAILS
  // ============================================

  // Build match filter with optional category filter
  const matchFilter: any = {
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    outletId: new mongoose.Types.ObjectId(outletId as string),
    businessDayId: { $in: businessDayIds.map((id) => new mongoose.Types.ObjectId(id)) },
  };

  // Add category filter if provided
  if (categoryId) {
    if (!mongoose.Types.ObjectId.isValid(categoryId as string)) {
      throw utils.createError(400, "Invalid category ID format");
    }
    matchFilter.categoryId = new mongoose.Types.ObjectId(categoryId as string);
  }

  // Add paymentType filter if provided
  if (paymentType) {
    if (!["cash", "card", "upi"].includes(paymentType as string)) {
      throw utils.createError(400, "paymentType must be one of: cash, card, upi");
    }
    matchFilter.paymentType = paymentType;
  }

  const expensesAgg = await ExpenseModel.aggregate([
    {
      $match: matchFilter,
    },
    {
      $lookup: {
        from: "expense_categories",
        localField: "categoryId",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        categoryName: { $ifNull: ["$category.name", "Uncategorized"] },
        date: 1,
        remarks: 1,
        amount: 1,
        paymentType: 1,
        businessDayId: 1,
      },
    },
    { $sort: { categoryName: 1 } },
    {
      $facet: {
        metadata: [{ $count: "total" }, { $addFields: { totalAmount: { $sum: "$amount" } } }],
        data: [{ $skip: skip }, { $limit: limitNum }],
      },
    },
  ]);

  const result = expensesAgg[0];
  const total = result.metadata[0]?.total || 0;
  const expenses = result.data;

  // Create a map of businessDayId -> BusinessDay for quick date lookup
  const businessDayMap = new Map(businessDayDatas.map((bd: any) => [bd._id.toString(), bd]));

  // Format the response with serial numbers (using outlet's timezone)
  const data = expenses.map((expense, index) => {
    // Get date from business day data
    const businessDay = businessDayMap.get(expense.businessDayId?.toString());
    let formattedBusinessDate = "Unknown Date";

    if (businessDay) {
      formattedBusinessDate = businessDay.startedAt;
    }

    return {
      sNo: skip + index + 1,
      // paymentCategory: expense.categoryName,
      // date: new Date(expense.date).toISOString(),
      // remarks: expense.remarks || "",
      // amount: Number(expense.amount.toFixed(2)),
      ...expense,
      businessDate: formattedBusinessDate,
    };
  });

  // Calculate total amount for current page
  const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  // Calculate totals by payment type
  const totalsByPaymentType = expenses.reduce(
    (acc, expense) => {
      if (expense.paymentType === "cash") {
        acc.cash += expense.amount;
      } else if (expense.paymentType === "card") {
        acc.card += expense.amount;
      } else if (expense.paymentType === "upi") {
        acc.upi += expense.amount;
      }
      return acc;
    },
    { cash: 0, card: 0, upi: 0 },
  );

  return {
    data,
    totalExpenses: {
      count: total,
      totalAmount: Number(totalAmount.toFixed(2)),
    },
    totalsByPaymentType: {
      cash: Number(totalsByPaymentType.cash.toFixed(2)),
      card: Number(totalsByPaymentType.card.toFixed(2)),
      upi: Number(totalsByPaymentType.upi.toFixed(2)),
    },
    dateRange: {
      from: startDate,
      to: endDate,
      timezone: outletTimeZone,
    },
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum,
    },
  };
};

// ============================================
// SALES MARGIN REPORT - Daily sales, expenses, and profit
// ============================================

export const getSalesMarginReport = async (req: RequestWithUser) => {
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company");
  }

  const { outletId, fromDate, toDate, page = "1", limit = "10" } = req.query;

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

  // Validate required outlet and get outlet data with timezone
  OrderValidator.validateRequiredField(outletId, "outletId");
  const outlet = await OrderValidator.validateOutletAccess(outletId as string, req.user.companyId);

  // Get outlet timezone for proper date grouping
  const outletTimeZone = outlet.timeZone || "UTC";

  // Get date range
  // When fromDate === toDate, treat as single date query for better matching
  const isSameDate = fromDate && toDate && fromDate === toDate;

  const businessDayData = await getBusinessDayDataInternal(req.user.companyId, outletId as string, {
    startDate: fromDate as string,
    endDate: isSameDate ? undefined : (toDate as string), // If same date, don't pass endDate
    timezone: outletTimeZone, // Pass outlet timezone for accurate date matching
  });

  if (!businessDayData) {
    throw utils.createError(400, "Business days not found on the given date range");
  }

  // Convert to array if single object
  const businessDayDatas = Array.isArray(businessDayData) ? businessDayData : [businessDayData];

  // Validate we have business days
  if (businessDayDatas.length === 0) {
    throw utils.createError(400, "Business days not found on the given date range");
  }

  const lastBusinessData = businessDayDatas[0];
  const firstBusinessData = businessDayDatas[businessDayDatas.length - 1];
  const startDate: Date = new Date(firstBusinessData.startedAt);
  const endDate: Date = new Date(lastBusinessData?.endedAt || new Date());

  // Validate date range

  // ============================================
  // GROUP SALES AND EXPENSES BY BUSINESS DAY
  // ============================================

  // Create a map of businessDayId -> BusinessDay for quick date lookup
  const businessDayMap = new Map(businessDayDatas.map((bd: any) => [bd._id.toString(), bd]));

  // Get sales grouped by businessDayId
  const salesByBusinessDay = await OrderModel.aggregate([
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(req.user.companyId),
        outletId: new mongoose.Types.ObjectId(outletId as string),
        businessDayId: { $in: [...(businessDayDatas?.map?.((e) => e?._id) || [])] },
        paymentStatus: PaymentStatus.SETTLED,
        status: OrderStatus.CLOSED,
      },
    },
    {
      $group: {
        _id: { $toString: "$businessDayId" }, // Group by businessDayId string
        totalSales: { $sum: "$netAmount" },
      },
    },
  ]);

  // Get expenses grouped by businessDayId
  const expensesByBusinessDay = await ExpenseModel.aggregate([
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(req.user.companyId),
        outletId: new mongoose.Types.ObjectId(outletId as string),
        businessDayId: { $in: [...(businessDayDatas?.map?.((e) => e?._id) || [])] },
      },
    },
    {
      $group: {
        _id: { $toString: "$businessDayId" }, // Group by businessDayId string
        totalExpenses: { $sum: "$amount" },
      },
    },
  ]);

  // Create maps for quick lookup
  const salesMap = new Map(salesByBusinessDay.map((item) => [item._id, item.totalSales]));
  const expensesMap = new Map(expensesByBusinessDay.map((item) => [item._id, item.totalExpenses]));

  // Get all unique businessDayIds from both sales and expenses
  const allBusinessDayIds = new Set([...salesMap.keys(), ...expensesMap.keys()]);

  // Build the report data
  const allData = Array.from(allBusinessDayIds)
    .map((bdId) => {
      const sales = salesMap.get(bdId) || 0;
      const expenses = expensesMap.get(bdId) || 0;
      const profit = sales - expenses;

      // Get date from business day data (return as ISO string)
      const businessDay = businessDayMap.get(bdId);
      let businessDate = new Date().toISOString();
      let timestamp = Date.now();

      if (businessDay) {
        businessDate = businessDay.startedAt; // Raw ISO string or Date
        timestamp = new Date(businessDay.startedAt).getTime();
      }

      return {
        date: businessDate,
        timestamp, // For sorting
        sales: Number(sales.toFixed(2)),
        expenses: Number(expenses.toFixed(2)),
        profit: Number(profit.toFixed(2)),
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp) // Sort by date
    .map(({ timestamp, ...rest }) => rest); // Remove timestamp from final output

  // Apply pagination
  const total = allData.length;
  const paginatedData = allData.slice(skip, skip + limitNum);

  // Calculate totals for the entire dataset (not just current page)
  const totalSales = allData.reduce((sum, item) => sum + item.sales, 0);
  const totalExpenses = allData.reduce((sum, item) => sum + item.expenses, 0);
  const totalProfit = totalSales - totalExpenses;

  return {
    data: paginatedData,
    summary: {
      totalSales: Number(totalSales.toFixed(2)),
      totalExpenses: Number(totalExpenses.toFixed(2)),
      totalProfit: Number(totalProfit.toFixed(2)),
      profitMargin: totalSales > 0 ? Number(((totalProfit / totalSales) * 100).toFixed(2)) : 0,
    },
    dateRange: {
      from: startDate.toISOString().split("T")[0],
      to: endDate.toISOString().split("T")[0],
    },
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum,
    },
  };
};

// ============================================
// HOURLY SALES DATA - For admin dashboard graphs
// ============================================

export const getHourlySalesData = async (req: RequestWithUser) => {
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company");
  }

  const { outletId, fromDate, toDate, interval = "1" } = req.query;

  // Validate required outlet and get outlet data with timezone
  OrderValidator.validateRequiredField(outletId, "outletId");
  const outlet = await OrderValidator.validateOutletAccess(outletId as string, req.user.companyId);

  // Parse interval (default to 1 hour)
  const hourInterval = parseInt(interval as string, 10);
  if (isNaN(hourInterval) || hourInterval < 1 || hourInterval > 24) {
    throw utils.createError(400, "Invalid interval. Must be between 1 and 24 hours");
  }

  // Get outlet timezone
  const outletTimeZone = outlet.timeZone || "UTC";

  // When fromDate === toDate, treat as single date query for better matching
  const isSameDate = fromDate && toDate && fromDate === toDate;

  // Get business day data with timezone for accurate date matching
  const businessDayData = await getBusinessDayDataInternal(req.user.companyId, outletId as string, {
    startDate: fromDate as string,
    endDate: isSameDate ? undefined : (toDate as string), // If same date, don't pass endDate
    timezone: outletTimeZone, // Pass outlet timezone for accurate date matching
  });

  if (!businessDayData) {
    throw utils.createError(400, "No business day data found for the given date range");
  }

  // Convert to array format (could be single day or multiple days)
  const businessDayDatas = Array.isArray(businessDayData) ? businessDayData : [businessDayData];

  // Validate we have business days
  if (businessDayDatas.length === 0) {
    throw utils.createError(400, "No business day data found for the given date range");
  }

  // Extract business day IDs and date range
  const businessDayIds: string[] = businessDayDatas.map((bd: any) => bd._id.toString());
  const startDate = new Date(businessDayDatas[0].startedAt);
  const endDate = businessDayDatas[businessDayDatas.length - 1].endedAt
    ? new Date(businessDayDatas[businessDayDatas.length - 1].endedAt)
    : new Date();
  const timezoneData = utils.getDateDataFromTimeZone(outletTimeZone, startDate);

  // Get starting hour from startDate in outlet's timezone
  const startHourLocal = timezoneData.hour;

  // Aggregate hourly sales data - Extract hour in outlet's timezone
  // Using dateToString for timezone-aware hour extraction for better compatibility
  const hourlySalesAgg = await OrderModel.aggregate([
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(req.user.companyId),
        outletId: new mongoose.Types.ObjectId(outletId as string),
        businessDayId: { $in: businessDayIds.map((id) => new mongoose.Types.ObjectId(id)) },
        paymentStatus: PaymentStatus.SETTLED,
        status: OrderStatus.CLOSED,
      },
    },
    {
      $project: {
        // Extract hour (HH format) in outlet's timezone using dateToString
        // This is more reliable than $hour for timezone conversion
        hourStr: {
          $dateToString: {
            format: "%H",
            date: "$createdAt",
            timezone: outletTimeZone,
          },
        },
        // Also keep the full datetime for reference
        createdAt: "$createdAt",
        netAmount: 1,
        totalAmount: 1,
        discount: 1,
      },
    },
    {
      $project: {
        // Convert hour string to number for grouping
        hour: { $toInt: "$hourStr" },
        createdAt: 1,
        netAmount: 1,
        totalAmount: 1,
        discount: 1,
      },
    },
    {
      $group: {
        _id: "$hour",
        transactions: { $sum: 1 },
        sales: { $sum: "$netAmount" },
        grossSales: { $sum: "$totalAmount" },
        discounts: { $sum: { $ifNull: ["$discount.discountAmount", 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Create a map of hourly data for quick lookup
  const hourlyDataMap = new Map();
  hourlySalesAgg.forEach((item) => {
    hourlyDataMap.set(item._id, {
      transactions: item.transactions,
      sales: item.sales,
      grossSales: item.grossSales,
      discounts: item.discounts,
    });
  });

  // Create time intervals starting from the startHourLocal (outlet's timezone)
  // Generate 24 hours of data starting from the specified hour
  const intervals: any[] = [];

  if (hourInterval === 1) {
    // For 1-hour intervals, create 24 hourly slots starting from startHourLocal
    for (let i = 0; i < 24; i++) {
      const currentHour = (startHourLocal + i) % 24;
      const hourStr = String(currentHour).padStart(2, "0");

      const hourData = hourlyDataMap.get(currentHour) || {
        transactions: 0,
        sales: 0,
        grossSales: 0,
        discounts: 0,
      };

      intervals.push({
        interval: `${hourStr}:00`,
        hour: currentHour,
        transactions: hourData.transactions,
        sales: hourData.sales,
        grossSales: hourData.grossSales,
        discounts: hourData.discounts,
      });
    }
  } else {
    // For multi-hour intervals (2, 3, 4, etc. hours)
    const numIntervals = Math.ceil(24 / hourInterval);

    for (let i = 0; i < numIntervals; i++) {
      const intervalStartHour = (startHourLocal + i * hourInterval) % 24;
      const intervalEndHour = (startHourLocal + (i + 1) * hourInterval) % 24;

      const startHourStr = String(intervalStartHour).padStart(2, "0");
      const endHourStr = String(intervalEndHour).padStart(2, "0");

      // Aggregate data for all hours in this interval
      let intervalData = {
        transactions: 0,
        sales: 0,
        grossSales: 0,
        discounts: 0,
      };

      for (let h = 0; h < hourInterval; h++) {
        const currentHour = (intervalStartHour + h) % 24;
        const hourData = hourlyDataMap.get(currentHour);

        if (hourData) {
          intervalData.transactions += hourData.transactions;
          intervalData.sales += hourData.sales;
          intervalData.grossSales += hourData.grossSales;
          intervalData.discounts += hourData.discounts;
        }
      }

      intervals.push({
        interval: `${startHourStr}:00-${endHourStr}:00`,
        startHour: intervalStartHour,
        endHour: intervalEndHour,
        transactions: intervalData.transactions,
        sales: intervalData.sales,
        grossSales: intervalData.grossSales,
        discounts: intervalData.discounts,
      });
    }
  }

  // Format the data for response
  const formattedData = intervals.map((interval) => ({
    interval: interval.interval,
    transactions: interval.transactions,
    sales: Number(interval.sales.toFixed(2)),
    grossSales: Number(interval.grossSales.toFixed(2)),
    discounts: Number(interval.discounts.toFixed(2)),
    averageOrderValue: interval.transactions > 0 ? Number((interval.sales / interval.transactions).toFixed(2)) : 0,
  }));

  // Calculate summary
  const totalTransactions = formattedData.reduce((sum, item) => sum + item.transactions, 0);
  const totalSales = formattedData.reduce((sum, item) => sum + item.sales, 0);
  const totalGrossSales = formattedData.reduce((sum, item) => sum + item.grossSales, 0);
  const totalDiscounts = formattedData.reduce((sum, item) => sum + item.discounts, 0);

  // Find peak hour
  const peakHour = formattedData.reduce(
    (max, item) => (item.sales > max.sales ? item : max),
    formattedData[0] || { interval: "N/A", sales: 0 },
  );

  // Format date range with proper timezone awareness
  const outletTimeZoneFormatted = outlet.timeZone || "UTC";
  const fromDateFormatted = startDate.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: outletTimeZoneFormatted,
  });
  const fromTimeFormatted = startDate.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: outletTimeZoneFormatted,
  });

  const toDateFormatted = endDate.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: outletTimeZoneFormatted,
  });
  const toTimeFormatted = endDate.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: outletTimeZoneFormatted,
  });

  return {
    data: formattedData,
    summary: {
      totalTransactions,
      totalSales: Number(totalSales.toFixed(2)),
      totalGrossSales: Number(totalGrossSales.toFixed(2)),
      totalDiscounts: Number(totalDiscounts.toFixed(2)),
      averageOrderValue: totalTransactions > 0 ? Number((totalSales / totalTransactions).toFixed(2)) : 0,
      peakHour: {
        interval: peakHour.interval,
        sales: peakHour.sales,
        transactions: peakHour.transactions,
      },
    },
    dateRange: {
      from: startDate.toISOString(),
      to: endDate.toISOString(),
      fromFormatted: `${fromDateFormatted} ${fromTimeFormatted}`,
      toFormatted: `${toDateFormatted} ${toTimeFormatted}`,
      timezone: outletTimeZoneFormatted,
    },
    interval: `${hourInterval} hour${hourInterval > 1 ? "s" : ""}`,
  };
};

// ============================================
// VOIDED ORDERS DETAILS REPORT
// ============================================

// TODO: Can be removed after testing
export const getVoidedOrdersDetails = async (req: RequestWithUser) => {
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company");
  }

  const { outletId, fromDate, toDate, page = "1", limit = "10" } = req.query as any;

  // Parse pagination parameters
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  // Validate pagination
  if (isNaN(pageNum) || pageNum < 1) {
    throw utils.createError(400, "Invalid page number");
  }
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    throw utils.createError(400, "Invalid limit. Must be between 1 and 100");
  }

  const skip = (pageNum - 1) * limitNum;

  // Validate required outlet and get outlet data with timezone
  OrderValidator.validateRequiredField(outletId, "outletId");
  const outlet = await OrderValidator.validateOutletAccess(String(outletId), req.user.companyId);

  // Get outlet timezone
  const outletTimeZone = outlet.timeZone || "UTC";

  const businessDayData = await getBusinessDayDataInternal(req.user.companyId, outletId as string, {
    startDate: fromDate as string,
    endDate: toDate as string,
    timezone: outletTimeZone, // Pass outlet timezone for accurate date matching
  });

  if (!businessDayData) {
    throw utils.createError(400, "No business day data found for the given date range");
  }

  // Base match for cancelled orders
  const baseMatch: any = {
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    outletId: new mongoose.Types.ObjectId(String(outletId)),
    status: OrderStatus.CANCELLED,
  };

  // Role-based visibility: waiters see only their own orders
  if (req.user?.role === UserRole.WAITER && req.user?._id) {
    baseMatch.orderTakenBy = new mongoose.Types.ObjectId(req.user._id);
  }

  // Use businessDayId if available, otherwise fall back to date range
  baseMatch.businessDayId = { $in: businessDayData?.map((e: any) => new mongoose.Types.ObjectId(e?._id)) };

  // Get total count for pagination
  const totalCount = await OrderModel.aggregate([{ $match: baseMatch }, { $unwind: "$items" }, { $count: "total" }]);

  const total = totalCount[0]?.total || 0;

  // Get voided orders data with pagination
  const [{ data, totals }] = await OrderModel.aggregate([
    { $match: baseMatch },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "order_types",
        localField: "orderTypeId",
        foreignField: "_id",
        as: "orderType",
      },
    },
    { $unwind: { path: "$orderType", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "users",
        localField: "orderCancelledBy",
        foreignField: "_id",
        as: "cancelUser",
      },
    },
    { $unwind: { path: "$cancelUser", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "cancel_reasons",
        localField: "orderCancelledReasonId",
        foreignField: "_id",
        as: "cancelReason",
      },
    },
    { $unwind: { path: "$cancelReason", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        orderNo: "$orderNumber",
        orderType: { $ifNull: ["$orderType.type", null] },
        orderDate: "$createdAt",
        voidDate: "$orderCancelledAt",
        voidedBy: { $ifNull: ["$cancelUser.name", null] },
        reason: { $ifNull: ["$cancelReason.reason", null] },
        remarks: { $ifNull: ["$orderCancelledRemark", { $ifNull: ["$note", ""] }] },
        item: { $ifNull: ["$items.name", null] },
        qty: { $ifNull: ["$items.quantity", 0] },
        price: { $ifNull: ["$items.unitPrice", 0] },
        totalAmount: { $ifNull: ["$items.totalAmount", 0] },
        isItemVoid: { $ifNull: ["$items.isVoid", false] },
      },
    },
    {
      $facet: {
        data: [{ $sort: { voidDate: -1, orderDate: -1 } }, { $skip: skip }, { $limit: limitNum }],
        totals: [
          {
            $group: {
              _id: null,
              totalQty: { $sum: "$qty" },
              totalAmount: { $sum: "$totalAmount" },
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
            },
          },
        ],
      },
    },
  ]);

  // Format dates in outlet timezone
  // const formattedData = data.map((item) => ({
  //   ...item,
  // }));

  return {
    data: data,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum,
    },
    dateRange: {
      // from: startOfDay.toISOString(),
      // to: endOfDay.toISOString(),
      timezone: outletTimeZone,
    },
    totals: totals?.[0],
    // businessDayId: businessDayId?.toString() || null,
  };
};

export const getCancelledOrdersSummary = async (req: RequestWithUser) => {
  const { outletId, fromDate, toDate, page = "1", limit = "10" } = req.query as any;

  // Parse pagination parameters
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  // Validate pagination
  if (isNaN(pageNum) || pageNum < 1) {
    throw utils.createError(400, "Invalid page number");
  }
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    throw utils.createError(400, "Invalid limit. Must be between 1 and 100");
  }

  const skip = (pageNum - 1) * limitNum;

  // Validate required outlet and get outlet data with timezone
  OrderValidator.validateRequiredField(outletId, "outletId");
  const outlet = await OrderValidator.validateOutletAccess(String(outletId), req.user.companyId!);

  // Get outlet timezone
  const outletTimeZone = outlet.timeZone || "UTC";

  let businessDayData = await getBusinessDayDataInternal(req.user.companyId!, outletId as string, {
    startDate: fromDate as string,
    endDate: toDate as string,
    timezone: outletTimeZone, // Pass outlet timezone for accurate date matching
  });

  if (!businessDayData) {
    throw utils.createError(400, "No business day data found for the given date range");
  }

  if (businessDayData && !Array.isArray(businessDayData)) {
    businessDayData = [businessDayData];
  }

  // Base match for cancelled orders
  const baseMatch: any = {
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    outletId: new mongoose.Types.ObjectId(String(outletId)),
    status: OrderStatus.CANCELLED,
    businessDayId: { $in: businessDayData?.map((e: any) => new mongoose.Types.ObjectId(e?._id)) },
  };

  // Role-based visibility: waiters see only their own orders
  if (req.user?.role === UserRole.WAITER && req.user?._id) {
    baseMatch.orderTakenBy = new mongoose.Types.ObjectId(req.user._id);
  }

  const [aggrResponse] = await OrderModel.aggregate([
    { $match: baseMatch },
    {
      $lookup: {
        from: "order_types",
        localField: "orderTypeId",
        foreignField: "_id",
        as: "orderType",
      },
    },
    { $unwind: { path: "$orderType", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "users",
        localField: "orderCancelledBy",
        foreignField: "_id",
        as: "cancelUser",
      },
    },
    { $unwind: { path: "$cancelUser", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "cancel_reasons",
        localField: "orderCancelledReasonId",
        foreignField: "_id",
        as: "cancelReason",
      },
    },
    { $unwind: { path: "$cancelReason", preserveNullAndEmptyArrays: true } },
    {
      $facet: {
        data: [
          { $sort: { orderNumber: 1 } },
          {
            $project: {
              orderNo: "$orderNumber",
              orderType: { $ifNull: ["$orderType.type", null] },
              orderDate: "$createdAt",
              voidDate: "$orderCancelledAt",
              voidedBy: { $ifNull: ["$cancelUser.name", null] },
              reason: { $ifNull: ["$cancelReason.reason", null] },
              remarks: { $ifNull: ["$orderCancelledRemark", { $ifNull: ["$note", ""] }] },
              items: 1,
              totalAmount: 1,
              netAmount: 1,
            },
          },
          { $skip: skip },
          { $limit: limitNum },
        ],
        totalDocs: [{ $count: "total" }],
        totals: [
          {
            $group: {
              _id: null,
              totalQty: { $sum: { $sum: "$items.quantity" } },
              totalAmount: { $sum: "$totalAmount" },
              netAmount: { $sum: "$netAmount" },
              itemsCount: { $sum: { $size: "$items" } },
            },
          },
          {
            $project: {
              _id: 0,
            },
          },
        ],
      },
    },
  ]);

  const total = aggrResponse?.totalDocs?.[0]?.total || 0;

  return {
    data: aggrResponse?.data || [],
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum,
    },
    dateRange: {
      timezone: outletTimeZone,
    },
  };
};

// ============================================
// CANCELLED ITEMS REPORT - Individual voided items
// ============================================

export const getCancelledItemsSummary = async (req: RequestWithUser) => {
  const { outletId, fromDate, toDate, page = "1", limit = "10" } = req.query as any;

  // Parse pagination parameters
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  // Validate pagination
  if (isNaN(pageNum) || pageNum < 1) {
    throw utils.createError(400, "Invalid page number");
  }
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    throw utils.createError(400, "Invalid limit. Must be between 1 and 100");
  }

  const skip = (pageNum - 1) * limitNum;

  // Validate required outlet and get outlet data with timezone
  OrderValidator.validateRequiredField(outletId, "outletId");
  const outlet = await OrderValidator.validateOutletAccess(String(outletId), req.user.companyId!);

  // Get outlet timezone
  const outletTimeZone = outlet.timeZone || "UTC";

  let businessDayData = await getBusinessDayDataInternal(req.user.companyId!, outletId as string, {
    startDate: fromDate as string,
    endDate: toDate as string,
    timezone: outletTimeZone, // Pass outlet timezone for accurate date matching
  });

  if (!businessDayData) {
    throw utils.createError(400, "No business day data found for the given date range");
  }

  if (businessDayData && !Array.isArray(businessDayData)) {
    businessDayData = [businessDayData];
  }

  // Base match for orders containing voided items or cancelled orders
  const baseMatch: any = {
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    outletId: new mongoose.Types.ObjectId(String(outletId)),
    businessDayId: { $in: businessDayData?.map((e: any) => new mongoose.Types.ObjectId(e?._id)) },
    $or: [
      { "items.isVoid": true }, // Match orders that have at least one voided item
      { status: OrderStatus.CANCELLED }, // Match cancelled orders
    ],
  };

  // Role-based visibility: waiters see only their own orders
  if (req.user?.role === UserRole.WAITER && req.user?._id) {
    baseMatch.orderTakenBy = new mongoose.Types.ObjectId(req.user._id);
  }

  const [aggrResponse] = await OrderModel.aggregate([
    { $match: baseMatch },
    // Unwind items array to work with individual items
    { $unwind: "$items" },
    // Filter to include voided items OR items from cancelled orders
    {
      $match: {
        $or: [{ "items.isVoid": true }, { status: OrderStatus.CANCELLED }],
      },
    },
    {
      $lookup: {
        from: "order_types",
        localField: "orderTypeId",
        foreignField: "_id",
        as: "orderType",
      },
    },
    { $unwind: { path: "$orderType", preserveNullAndEmptyArrays: true } },
    // Lookup for order cancellation user
    {
      $lookup: {
        from: "users",
        localField: "orderCancelledBy",
        foreignField: "_id",
        as: "cancelUser",
      },
    },
    { $unwind: { path: "$cancelUser", preserveNullAndEmptyArrays: true } },
    // Lookup for item void user
    {
      $lookup: {
        from: "users",
        localField: "items.voidedBy",
        foreignField: "_id",
        as: "itemVoidUser",
      },
    },
    { $unwind: { path: "$itemVoidUser", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "cancel_reasons",
        localField: "orderCancelledReasonId",
        foreignField: "_id",
        as: "cancelReason",
      },
    },
    { $unwind: { path: "$cancelReason", preserveNullAndEmptyArrays: true } },
    {
      $facet: {
        data: [
          { $sort: { "items.name": 1 } },
          {
            $project: {
              orderNo: "$orderNumber",
              orderType: { $ifNull: ["$orderType.type", null] },
              orderDate: {
                $dateToString: {
                  date: "$createdAt",
                  timezone: outletTimeZone,
                  format: "%Y-%m-%d %H:%M:%S",
                },
              },
              // Use item void details if available, otherwise fallback to order cancellation details
              voidDate: {
                $dateToString: {
                  date: { $ifNull: ["$items.voidedAt", "$orderCancelledAt"] },
                  timezone: outletTimeZone,
                  format: "%Y-%m-%d %H:%M:%S",
                },
              },
              voidedBy: { $ifNull: ["$itemVoidUser.name", { $ifNull: ["$cancelUser.name", null] }] },
              reason: { $ifNull: ["$items.voidReason", { $ifNull: ["$cancelReason.reason", null] }] },
              remarks: { $ifNull: ["$orderCancelledRemark", { $ifNull: ["$items.note", ""] }] },
              itemName: { $ifNull: ["$items.name", null] },
              unitPrice: { $ifNull: ["$items.unitPrice", 0] },
              quantity: { $ifNull: ["$items.quantity", 0] },
              totalAmount: { $ifNull: ["$items.totalAmount", 0] },
            },
          },
          { $skip: skip },
          { $limit: limitNum },
        ],
        totalDocs: [{ $count: "total" }],
        totals: [
          {
            $group: {
              _id: null,
              totalQty: { $sum: "$items.quantity" },
              totalAmount: { $sum: "$items.totalAmount" },
              itemsCount: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
            },
          },
        ],
      },
    },
  ]);

  const total = aggrResponse?.totalDocs?.[0]?.total || 0;

  return {
    data: aggrResponse?.data || [],
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum,
    },
    dateRange: {
      timezone: outletTimeZone,
    },
    totals: aggrResponse?.totals?.[0],
  };
};
