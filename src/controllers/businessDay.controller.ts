import mongoose from "mongoose";
import { RequestWithUser } from "../types/utils";
import Utils from "../utils";
import BusinessDayModel from "../models/businessDay";
import OutletsModel from "../models/outlets";
import OrderModel from "../models/order";
import ExpenseModel from "../models/expense";
import { PaymentStatus, OrderStatus } from "../types/order";

const utils = new Utils();

// Helper function to calculate aggregated sales data for a business day
async function calculateBusinessDayTotals(businessDayId: string, companyId: string, outletId: string) {
  const agg = await OrderModel.aggregate([
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(companyId),
        outletId: new mongoose.Types.ObjectId(outletId),
        businessDayId: new mongoose.Types.ObjectId(businessDayId),
        paymentStatus: PaymentStatus.SETTLED,
        status: OrderStatus.CLOSED,
      },
    },
    {
      $group: {
        _id: null,
        totalUpi: { $sum: { $ifNull: ["$paymentSettlement.upi", 0] } },
        totalCard: { $sum: { $ifNull: ["$paymentSettlement.card", 0] } },
        totalCash: { $sum: { $ifNull: ["$paymentSettlement.cash", 0] } },
        netAmount: { $sum: { $ifNull: ["$netAmount", 0] } },
        totalAmount: { $sum: { $ifNull: ["$totalAmount", 0] } },
        totalDiscounts: { $sum: { $ifNull: ["$discount.discountAmount", 0] } },
        deliveryCharge: { $sum: { $ifNull: ["$deliveryCharges", 0] } },
      },
    },
  ]);

  const totals = agg[0] || { totalUpi: 0, totalCard: 0, totalCash: 0, netAmount: 0, totalAmount: 0, totalDiscounts: 0, deliveryCharge: 0 };

  // ============================================
  // ACCOUNTING CALCULATIONS (Production-Level CRM Standard)
  // ============================================

  // 1. Gross Sales = Sum of all order totalAmounts (before discounts)
  const totalSales = Number(totals.totalAmount.toFixed(2));

  // 2. Total Discounts = Sum of all discount amounts given
  const totalDiscounts = Number(totals.totalDiscounts.toFixed(2));

  // 3. Delivery Charges = Sum of all delivery charges collected
  const deliveryCharge = Number(totals.deliveryCharge.toFixed(2));

  // 4. Payment Breakdown
  const totalCash = Number(totals.totalCash.toFixed(2));
  const totalCard = Number(totals.totalCard.toFixed(2));
  const totalUpi = Number(totals.totalUpi.toFixed(2));

  // 5. Total Payments Collected = Cash + Card + UPI
  const totalPayments = Number((totalCash + totalCard + totalUpi).toFixed(2));

  // 6. Net Sales = Sum of all order.netAmount
  // Formula per order: netAmount = totalAmount - discountAmount + deliveryCharges
  // This represents the actual money to be collected from customers
  const netSales = Number(totals.netAmount.toFixed(2));

  // ============================================
  // VALIDATION: Ensure accounting integrity
  // ============================================
  // In a proper POS system: totalPayments MUST equal netSales
  // This ensures all money collected matches what should have been collected
  const difference = Math.abs(totalPayments - netSales);
  if (difference > 0.01) {
    // Allow 1 cent difference for rounding
    console.warn(`⚠️ Payment mismatch detected: totalPayments (${totalPayments}) != netSales (${netSales}). Difference: ${difference}`);
  }

  return {
    totalSales, // Gross sales (before discounts)
    totalCash, // Cash payments collected
    totalCard, // Card payments collected
    totalUpi, // UPI payments collected
    totalPayments, // Total of all payments (cash + card + upi)
    totalDiscounts, // Total discounts given
    deliveryCharge, // Total delivery charges
    netSales, // Net sales after discounts and delivery charges = totalSales - totalDiscounts + deliveryCharge
  };
}

// Helper function to calculate total expenses for a business day
async function calculateBusinessDayExpenses(businessDayId: string, companyId: string, outletId: string) {
  const match: any = {
    companyId: new mongoose.Types.ObjectId(companyId),
    outletId: new mongoose.Types.ObjectId(outletId),
    businessDayId: new mongoose.Types.ObjectId(businessDayId),
  };

  const expenseAgg = await ExpenseModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalExpense: { $sum: "$amount" },
      },
    },
  ]);

  const totalExpense = expenseAgg[0]?.totalExpense || 0;
  return Number(totalExpense.toFixed(2));
}

// Internal utility function to get business day data with flexible parameters
export async function getBusinessDayDataInternal(
  companyId: string,
  outletId: string,
  options?: {
    startDate?: Date | string;
    endDate?: Date | string;
    timezone?: string; // Optional: outlet timezone for accurate date matching (e.g., "Asia/Kolkata")
  },
) {
  // Case 1: No dates provided - return current business day (open day)
  if (!options?.startDate && !options?.endDate) {
    const currentDay = await BusinessDayModel.findOne({
      companyId: new mongoose.Types.ObjectId(companyId),
      outletId: new mongoose.Types.ObjectId(outletId),
      endedAt: null,
    });

    if (!currentDay) return null;

    return enrichBusinessDayWithTotals(currentDay, companyId);
  }

  // Case 2: Only startDate provided - return business day at that specific date
  if (options?.startDate && !options.endDate) {
    const targetDate = options.startDate instanceof Date ? options.startDate : new Date(options.startDate);
    if (isNaN(targetDate.getTime())) throw new Error("Invalid startDate format");

    const timezone = options.timezone || "UTC";

    // Find business day that was active at the target date
    // If timezone is provided, use timezone-aware date comparison
    const businessDay = await BusinessDayModel.findOne({
      companyId: new mongoose.Types.ObjectId(companyId),
      outletId: new mongoose.Types.ObjectId(outletId),
      $expr: {
        $and: [
          { $eq: [{ $dayOfMonth: { date: "$startedAt", timezone } }, { $dayOfMonth: { date: targetDate, timezone } }] },
          { $eq: [{ $month: { date: "$startedAt", timezone } }, { $month: { date: targetDate, timezone } }] },
          { $eq: [{ $year: { date: "$startedAt", timezone } }, { $year: { date: targetDate, timezone } }] },
        ],
      },
      $or: [{ endedAt: null }, { endedAt: { $gte: targetDate } }],
    });

    if (!businessDay) return null;

    return enrichBusinessDayWithTotals(businessDay, companyId);
  }

  // Case 3: Both startDate and endDate provided - return multiple business days in range
  if (options?.startDate && options?.endDate) {
    const start = options.startDate instanceof Date ? options.startDate : new Date(options.startDate);
    const end = options.endDate instanceof Date ? options.endDate : new Date(options.endDate);

    if (isNaN(start.getTime())) throw new Error("Invalid startDate format");
    if (isNaN(end.getTime())) throw new Error("Invalid endDate format");
    if (start > end) throw new Error("startDate must be before or equal to endDate");

    const timezone = options.timezone || "UTC";

    // Find all business days that overlap with the date range
    // Use timezone-aware date comparison when timezone is provided
    const businessDays = await BusinessDayModel.find({
      companyId: new mongoose.Types.ObjectId(companyId),
      outletId: new mongoose.Types.ObjectId(outletId),
      $expr: {
        $and: [
          // startedAt >= start (in outlet's timezone)
          {
            $gte: [
              {
                $dateFromParts: {
                  year: { $year: { date: "$startedAt", timezone } },
                  month: { $month: { date: "$startedAt", timezone } },
                  day: { $dayOfMonth: { date: "$startedAt", timezone } },
                },
              },
              {
                $dateFromParts: {
                  year: { $year: { date: start, timezone } },
                  month: { $month: { date: start, timezone } },
                  day: { $dayOfMonth: { date: start, timezone } },
                },
              },
            ],
          },
          // startedAt <= end (in outlet's timezone)
          {
            $lte: [
              {
                $dateFromParts: {
                  year: { $year: { date: "$startedAt", timezone } },
                  month: { $month: { date: "$startedAt", timezone } },
                  day: { $dayOfMonth: { date: "$startedAt", timezone } },
                },
              },
              {
                $dateFromParts: {
                  year: { $year: { date: end, timezone } },
                  month: { $month: { date: end, timezone } },
                  day: { $dayOfMonth: { date: end, timezone } },
                },
              },
            ],
          },
        ],
      },
    }).sort({ startedAt: -1 });

    // Enrich each business day with calculated totals
    const enrichedDays = await Promise.all(businessDays.map((day) => enrichBusinessDayWithTotals(day, companyId)));

    return enrichedDays;
  }

  return null;
}

/**
 * Helper function to enrich business day with real-time calculated totals
 *
 * ACCOUNTING FLOW (Production-Level CRM Standard):
 * 1. startingBalance = Opening cash drawer balance at day start
 * 2. totalSales (Gross Sales) = Sum of all order.totalAmount (before any deductions)
 * 3. totalDiscounts = Sum of all discounts given to customers
 * 4. deliveryCharge = Sum of all delivery charges collected
 * 5. netSales = totalSales - totalDiscounts + deliveryCharge (money to be collected)
 * 6. totalCash + totalCard + totalUpi = totalPayments (actual money collected)
 * 7. VALIDATION: totalPayments MUST equal netSales
 * 8. totalExpense = Sum of all business day expenses
 * 9. netTotal = netSales - totalExpense (final profit/loss for the day)
 * 10. closingBalance = Physical cash count at day end (set during close)
 * 11. variance = closingBalance - (startingBalance + totalCash)
 *
 * Expected Cash Balance Check:
 * expectedCash = startingBalance + totalCash - (cash expenses if tracked)
 * closingBalance should approximately equal expectedCash (variance is over/short)
 */
async function enrichBusinessDayWithTotals(businessDay: any, companyId: string) {
  // Get aggregated sales data from all settled & closed orders
  const totals = await calculateBusinessDayTotals(businessDay._id.toString(), companyId, businessDay.outletId.toString());

  // Get aggregated expense data for this business day
  const totalExpense = await calculateBusinessDayExpenses(businessDay._id.toString(), companyId, businessDay.outletId.toString());

  // Use netSales from aggregation (already calculated correctly in calculateBusinessDayTotals)
  const netSales = totals.netSales;

  // Calculate final profit/loss: netTotal = netSales - totalExpense
  // USER REQUEST: starting balance is not added in the net total in get bussiness day api
  // So we add startingBalance to netTotal? Or is it just for display?
  // Usually netTotal (Profit) shouldn't include startingBalance.
  // But if the user wants "Cash in Hand" or similar, it should include it.
  // Based on "starting balance is not added in the net total", I will add it.
  const netTotal = Number((netSales - totalExpense + (businessDay.startingBalance || 0)).toFixed(2));

  // Calculate Variance if closing balance is set
  let variance = 0;
  if (businessDay.closingBalance !== undefined && businessDay.closingBalance !== null) {
    // OLD LOGIC: expectedCash = startingBalance + totalCash
    // const expectedCash = (businessDay.startingBalance || 0) + totals.totalCash;
    // variance = Number((businessDay.closingBalance - expectedCash).toFixed(2));

    // NEW LOGIC (User Request): Variance = Closing Balance - Net Total
    // Where Net Total = Net Sales - Expenses + Starting Balance
    variance = Number((businessDay.closingBalance - netTotal).toFixed(2));
  }

  return {
    ...(businessDay?.toObject?.() || businessDay),
    startingBalance: businessDay.startingBalance, // Opening balance at day start
    totalSales: totals.totalSales, // Gross sales (before discounts)
    totalDiscounts: totals.totalDiscounts, // Total discounts given
    deliveryCharge: totals.deliveryCharge, // Total delivery charges collected
    totalCash: totals.totalCash, // Cash payments received
    totalCard: totals.totalCard, // Card payments received
    totalUpi: totals.totalUpi, // UPI payments received
    totalPayments: totals.totalPayments, // Total of all payments (should = netSales)
    totalExpense, // Total expenses for the day
    netSales, // Net sales = totalSales - discounts + deliveryCharge = totalPayments
    netTotal, // Final profit/loss = netSales - totalExpense + startingBalance
    variance, // closingBalance - (startingBalance + totalCash)
  };
}

export const startBusinessDay = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  const { outletId, startingBalance = 0 } = req.body as any;
  if (!outletId) throw utils.createError(400, "outletId is required");
  if (!mongoose.Types.ObjectId.isValid(outletId)) throw utils.createError(400, "Invalid outletId");

  const outlet = await OutletsModel.findOne({ _id: outletId, companyId: req.user.companyId });
  if (!outlet) throw utils.createError(404, "Outlet not found in your company");

  const existingOpen = await BusinessDayModel.findOne({ companyId: req.user.companyId, outletId, endedAt: null });
  if (existingOpen) throw utils.createError(400, "A business day is already open for this outlet");

  const created = await BusinessDayModel.create({
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    brandId: outlet.brandId,
    outletId,
    startingBalance: Number(startingBalance) || 0,
    startedAt: new Date(),
    endedAt: null,
    createdBy: req.user._id,
    totalSales: 0,
    totalDiscounts: 0,
    deliveryCharge: 0,
    totalCash: 0,
    totalCard: 0,
    totalUpi: 0,
    totalExpense: 0,
    netSales: 0,
    netTotal: Number(startingBalance) || 0, // Initial netTotal includes starting balance
    variance: 0,
  });

  // Return with calculated totals (will be 0 initially)
  return enrichBusinessDayWithTotals(created, req.user.companyId);
};

export const getCurrentBusinessDay = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  const { outletId } = req.query as any;
  if (!outletId) throw utils.createError(400, "outletId is required");
  if (!mongoose.Types.ObjectId.isValid(outletId)) throw utils.createError(400, "Invalid outletId");
  const day = await BusinessDayModel.findOne({ companyId: req.user.companyId, outletId, endedAt: null });
  if (!day) throw utils.createError(404, "No open business day for this outlet");

  // Return with real-time calculated totals
  return enrichBusinessDayWithTotals(day, req.user.companyId);
};

/**
 * Close Business Day API - Production-Level Day Close Process
 *
 * PURPOSE: Finalizes the business day by calculating and saving all financial totals
 *
 * REQUIREMENTS:
 * 1. All orders must be closed (status = CLOSED) and settled (paymentStatus = SETTLED)
 * 2. Physical cash count (closingBalance) should be provided for cash variance tracking
 *
 * CALCULATION PROCESS:
 * 1. Aggregate all SETTLED & CLOSED orders for the day
 * 2. Calculate: totalSales, totalDiscounts, deliveryCharge, totalCash, totalCard, totalUpi
 * 3. Calculate: netSales = totalSales - totalDiscounts + deliveryCharge
 * 4. Validate: totalPayments (cash+card+upi) should equal netSales
 * 5. Aggregate all expenses for the day
 * 6. Calculate: netTotal = netSales - totalExpense (profit/loss)
 * 7. Save all calculated totals to the business day record
 * 8. Mark day as closed (set endedAt timestamp)
 *
 * VARIANCE TRACKING:
 * - expectedCash = startingBalance + totalCash
 * - cashVariance = closingBalance - expectedCash (over/short)
 * - Positive variance = overage (more cash than expected)
 * - Negative variance = shortage (less cash than expected)
 */
export const closeBusinessDay = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  const { businessDayId, closingBalance, remarks } = req.body;
  if (!businessDayId) throw utils.createError(400, "businessDayId is required");
  if (!mongoose.Types.ObjectId.isValid(businessDayId)) throw utils.createError(400, "Invalid businessDayId");

  const day = await BusinessDayModel.findOne({ _id: businessDayId, companyId: req.user.companyId, endedAt: null });
  if (!day) throw utils.createError(404, "Open business day not found");

  // ============================================
  // VALIDATION: Ensure all orders are closed
  // ============================================
  const pending = await OrderModel.findOne({
    companyId: req.user.companyId,
    outletId: day.outletId,
    businessDayId: day._id,
    status: OrderStatus.OPEN,
  });
  if (pending) throw utils.createError(400, "Cannot close day with open orders. Please close all orders first.");

  // ============================================
  // CALCULATE FINAL TOTALS
  // ============================================

  // Get sales totals from all settled & closed orders
  const totals = await calculateBusinessDayTotals(day._id.toString(), req.user.companyId, day.outletId.toString());

  // Get expense totals for the business day
  const totalExpense = await calculateBusinessDayExpenses(day._id.toString(), req.user.companyId, day.outletId.toString());

  // Use netSales from aggregation (already validated in calculateBusinessDayTotals)
  const netSales = totals.netSales;

  // Calculate final profit/loss: netTotal = netSales - totalExpense
  // Include startingBalance as per requirement
  const netTotal = Number((netSales - totalExpense + (day.startingBalance || 0)).toFixed(2));

  // Calculate Variance
  // OLD LOGIC: expectedCash = startingBalance + totalCash
  // const expectedCash = (day.startingBalance || 0) + totals.totalCash;
  const finalClosingBalance = closingBalance !== undefined && closingBalance !== null ? Number(closingBalance) : day.closingBalance ?? 0;
  // const variance = Number((finalClosingBalance - expectedCash).toFixed(2));

  // NEW LOGIC (User Request): Variance = Closing Balance - Net Total
  const variance = Number((finalClosingBalance - netTotal).toFixed(2));

  // ============================================
  // SAVE FINAL VALUES TO BUSINESS DAY
  // ============================================
  day.endedAt = new Date() as any;
  day.closedBy = req.user._id as any;
  day.closingBalance = closingBalance !== undefined && closingBalance !== null ? Number(closingBalance) : day.closingBalance ?? 0;
  if (remarks !== undefined) {
    day.remarks = String(remarks);
  }

  // Save all calculated totals (production-level accounting)
  day.totalSales = totals.totalSales; // Gross sales (before discounts)
  day.totalDiscounts = totals.totalDiscounts; // Total discounts given
  day.deliveryCharge = totals.deliveryCharge; // Total delivery charges collected
  day.totalCash = totals.totalCash; // Cash payments received
  day.totalCard = totals.totalCard; // Card payments received
  day.totalUpi = totals.totalUpi; // UPI payments received
  day.totalExpense = totalExpense; // Total expenses
  day.netSales = netSales; // Net sales = totalSales - discounts + deliveryCharge = totalPayments
  day.netTotal = netTotal; // Final profit/loss = netSales - totalExpense + startingBalance
  day.variance = variance; // closingBalance - (startingBalance + totalCash)

  await day.save();

  // Return with calculated totals (includes totalPayments for validation)
  return enrichBusinessDayWithTotals(day, req.user.companyId);
};

export const listBusinessDays = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  const { outletId } = req.query as any;
  if (!outletId) throw utils.createError(400, "outletId is required");
  if (!mongoose.Types.ObjectId.isValid(outletId)) throw utils.createError(400, "Invalid outletId");

  const businessDays = await BusinessDayModel.find({ companyId: req.user.companyId, outletId }).sort({ startedAt: -1 });

  // Enrich each business day with calculated totals
  const companyId = req.user.companyId; // Already validated above
  const enrichedDays = await Promise.all(businessDays.map((day) => enrichBusinessDayWithTotals(day, companyId)));

  return enrichedDays;
};

export const getBusinessDayData = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  const { outletId, startDate, endDate } = req.query as any;

  if (!outletId) throw utils.createError(400, "outletId is required");
  if (!mongoose.Types.ObjectId.isValid(outletId)) throw utils.createError(400, "Invalid outletId");

  try {
    const result = await getBusinessDayDataInternal(
      req.user.companyId,
      outletId,
      startDate || endDate ? { startDate, endDate } : undefined,
    );

    if (!result) {
      if (!startDate && !endDate) {
        throw utils.createError(404, "No open business day found for this outlet");
      }
      throw utils.createError(404, "No business day found for the specified date(s)");
    }

    return result;
  } catch (error: any) {
    if (error.statusCode) throw error;
    throw utils.createError(400, error.message || "Invalid date parameters");
  }
};
