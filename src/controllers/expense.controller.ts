import mongoose from "mongoose";
import { RequestWithUser } from "../types/utils";
import Utils from "../utils";
import ExpenseModel from "../models/expense";
import ExpenseCategoryModel from "../models/expenseCategory";
import OutletsModel from "../models/outlets";
import BusinessDayModel from "../models/businessDay";

const utils = new Utils();

export const createExpense = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  const { outletId, categoryId, amount, paymentType, remarks, date } = req.body as any;
  if (!outletId) throw utils.createError(400, "outletId is required");
  if (!categoryId) throw utils.createError(400, "categoryId is required");
  if (amount === undefined || amount === null) throw utils.createError(400, "amount is required");
  if (Number(amount) < 0) throw utils.createError(400, "amount must be >= 0");
  if (!paymentType) throw utils.createError(400, "paymentType is required");
  if (!["cash", "card", "upi"].includes(paymentType)) throw utils.createError(400, "paymentType must be one of: cash, card, upi");

  if (!mongoose.Types.ObjectId.isValid(outletId)) throw utils.createError(400, "Invalid outlet id");
  if (!mongoose.Types.ObjectId.isValid(categoryId)) throw utils.createError(400, "Invalid category id");

  const outlet = await OutletsModel.findOne({ _id: outletId, companyId: req.user.companyId });
  if (!outlet) throw utils.createError(404, "Outlet not found in your company");

  const category = await ExpenseCategoryModel.findOne({ _id: categoryId, companyId: req.user.companyId });
  if (!category) throw utils.createError(404, "Category not found in your company");

  // Fetch the active (currently open) business day for the outlet
  const activeBusinessDay = await BusinessDayModel.findOne({
    companyId: req.user.companyId,
    outletId,
    endedAt: { $eq: null }, // Active business day has no end date - use explicit $eq for null check
  });

  if (!activeBusinessDay) {
    throw utils.createError(400, "No active business day found for this outlet. Please start a business day first.");
  }

  const payload: any = {
    companyId: new mongoose.Types.ObjectId(req.user.companyId),
    outletId,
    brandId: outlet.brandId,
    businessDayId: activeBusinessDay._id,
    categoryId,
    amount: Number(amount),
    paymentType,
  };
  if (remarks) payload.remarks = remarks;
  if (date) payload.date = new Date(date);

  const created = await ExpenseModel.create(payload);
  return await ExpenseModel.findById(created._id)
    .populate("companyId")
    .populate("outletId")
    .populate("brandId")
    .populate("businessDayId")
    .populate("categoryId");
};

export const listExpenses = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  const companyId = new mongoose.Types.ObjectId(req.user.companyId);
  const { outletId, categoryId, from, to, paymentType } = req.query as any;

  if (!outletId) throw utils.createError(400, "outletId is required");
  if (!mongoose.Types.ObjectId.isValid(outletId)) throw utils.createError(400, "Invalid outlet id");
  const outlet = await OutletsModel.findOne({ _id: outletId, companyId });
  if (!outlet) throw utils.createError(404, "Outlet not found in your company");

  const match: any = { companyId, outletId: new mongoose.Types.ObjectId(outletId) };
  if (categoryId) {
    if (!mongoose.Types.ObjectId.isValid(categoryId)) throw utils.createError(400, "Invalid category id");
    match.categoryId = new mongoose.Types.ObjectId(categoryId);
  }

  if (paymentType) {
    if (!["cash", "card", "upi"].includes(paymentType)) {
      throw utils.createError(400, "paymentType must be one of: cash, card, upi");
    }
    match.paymentType = paymentType;
  }

  // Fetch business days in the given date range to get their IDs
  const hasFrom = Boolean(from);
  const hasTo = Boolean(to);
  let dateRange: { from: string; to: string } | null = null;
  let businessDayIds: any[] = [];

  if (hasFrom || hasTo) {
    // If from/to are provided, fetch business days within that range
    const fromDate = hasFrom ? new Date(from) : new Date("1900-01-01");
    const toDate = hasTo ? new Date(to) : new Date();

    // Get all business days that fall within or overlap the date range
    const businessDaysInRange = await BusinessDayModel.find({
      companyId,
      outletId: new mongoose.Types.ObjectId(outletId),
      startedAt: { $lte: toDate },
      $or: [
        { endedAt: { $eq: null } }, // Active business day (no end date)
        { endedAt: { $gte: fromDate } }, // Ended business day that overlaps the range
      ],
    });

    businessDayIds = businessDaysInRange.map((bd) => bd._id);

    // Return the provided dates
    dateRange = {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    };
  } else {
    // If from/to are not provided, use current business day
    const currentBusinessDay = await BusinessDayModel.findOne({
      companyId,
      outletId: new mongoose.Types.ObjectId(outletId),
      endedAt: { $eq: null }, // Active business day has no end date
    });

    if (currentBusinessDay) {
      businessDayIds = [currentBusinessDay._id];
      const businessDayStart = new Date(currentBusinessDay.startedAt);
      const businessDayEnd = currentBusinessDay.endedAt ? new Date(currentBusinessDay.endedAt) : new Date();
      dateRange = {
        from: businessDayStart.toISOString(),
        to: businessDayEnd.toISOString(),
      };
    } else {
      // Fallback to today's business day
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setUTCHours(23, 59, 59, 999);

      const todayBusinessDays = await BusinessDayModel.find({
        companyId,
        outletId: new mongoose.Types.ObjectId(outletId),
        startedAt: { $gte: todayStart, $lte: todayEnd },
      });

      businessDayIds = todayBusinessDays.map((bd) => bd._id);

      dateRange = {
        from: todayStart.toISOString(),
        to: todayEnd.toISOString(),
      };
    }
  }

  // Filter expenses by business day IDs
  if (businessDayIds.length > 0) {
    match.businessDayId = { $in: businessDayIds };
  } else {
    // No business days found, return empty result
    return { data: [], totalExpenseAmount: 0, dateRange };
  }

  const [result] = await ExpenseModel.aggregate([
    { $match: match },
    {
      $lookup: { from: "companies", localField: "companyId", foreignField: "_id", as: "company" },
    },
    { $unwind: "$company" },
    { $lookup: { from: "outlets", localField: "outletId", foreignField: "_id", as: "outlet" } },
    { $unwind: "$outlet" },
    { $lookup: { from: "brands", localField: "brandId", foreignField: "_id", as: "brand" } },
    { $unwind: "$brand" },
    { $lookup: { from: "business_days", localField: "businessDayId", foreignField: "_id", as: "businessDay" } },
    { $unwind: "$businessDay" },
    { $lookup: { from: "expense_categories", localField: "categoryId", foreignField: "_id", as: "category" } },
    { $unwind: "$category" },
    { $sort: { "category.name": 1 } },
    {
      $facet: {
        data: [
          {
            $project: {
              company: 1,
              outlet: 1,
              brand: 1,
              businessDay: 1,
              category: 1,
              amount: 1,
              paymentType: 1,
              remarks: 1,
              date: 1,
              businessDate: "$businessDay.startedAt",
              createdAt: 1,
              updatedAt: 1,
            },
          },
        ],
        total: [{ $group: { _id: null, total: { $sum: "$amount" } } }],
        paymentTypeTotals: [
          {
            $group: {
              _id: "$paymentType",
              total: { $sum: "$amount" },
            },
          },
        ],
      },
    },
  ]);

  const totalExpenseAmount = (result?.total?.[0]?.total as number) || 0;
  const data = result?.data || [];

  // Process payment type totals
  const paymentTypeTotals = result?.paymentTypeTotals || [];
  const totalsByPaymentType = {
    cash: 0,
    card: 0,
    upi: 0,
  };

  paymentTypeTotals.forEach((item: any) => {
    if (item._id === "cash") {
      totalsByPaymentType.cash = item.total;
    } else if (item._id === "card") {
      totalsByPaymentType.card = item.total;
    } else if (item._id === "upi") {
      totalsByPaymentType.upi = item.total;
    }
  });

  return {
    data,
    totalExpenseAmount,
    totalsByPaymentType: {
      cash: Number(totalsByPaymentType.cash.toFixed(2)),
      card: Number(totalsByPaymentType.card.toFixed(2)),
      upi: Number(totalsByPaymentType.upi.toFixed(2)),
    },
    dateRange,
  };
};

// Removed separate total endpoint; total is now included in listExpenses via $facet

export const getExpenseById = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) throw utils.createError(400, "Invalid expense id");
  const expense = await ExpenseModel.findOne({ _id: id, companyId: req.user.companyId })
    .populate("companyId")
    .populate("outletId")
    .populate("brandId")
    .populate("businessDayId")
    .populate("categoryId");
  if (!expense) throw utils.createError(404, "Expense not found");
  return expense;
};

export const updateExpense = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) throw utils.createError(400, "Invalid expense id");

  const { outletId, categoryId, amount, paymentType, remarks, date } = req.body as any;
  const updateSet: any = {};

  if (outletId) {
    if (!mongoose.Types.ObjectId.isValid(outletId)) throw utils.createError(400, "Invalid outlet id");
    const outlet = await OutletsModel.findOne({ _id: outletId, companyId: req.user.companyId });
    if (!outlet) throw utils.createError(404, "Outlet not found in your company");
    updateSet.outletId = outletId;
    updateSet.brandId = outlet.brandId;
  }
  if (categoryId) {
    if (!mongoose.Types.ObjectId.isValid(categoryId)) throw utils.createError(400, "Invalid category id");
    const category = await ExpenseCategoryModel.findOne({ _id: categoryId, companyId: req.user.companyId });
    if (!category) throw utils.createError(404, "Category not found in your company");
    updateSet.categoryId = categoryId;
  }
  if (amount !== undefined) {
    if (Number(amount) < 0) throw utils.createError(400, "amount must be >= 0");
    updateSet.amount = Number(amount);
  }
  if (paymentType !== undefined) {
    if (!["cash", "card", "upi"].includes(paymentType)) throw utils.createError(400, "paymentType must be one of: cash, card, upi");
    updateSet.paymentType = paymentType;
  }
  if (remarks !== undefined) updateSet.remarks = remarks;
  if (date !== undefined) updateSet.date = new Date(date);

  const updated = await ExpenseModel.findOneAndUpdate({ _id: id, companyId: req.user.companyId }, { $set: updateSet }, { new: true });
  if (!updated) throw utils.createError(404, "Expense not found");
  return await ExpenseModel.findById(updated._id)
    .populate("companyId")
    .populate("outletId")
    .populate("brandId")
    .populate("businessDayId")
    .populate("categoryId");
};

export const deleteExpense = async (req: RequestWithUser) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) throw utils.createError(400, "Invalid expense id");
  const deleted = await ExpenseModel.findOneAndDelete({ _id: id, companyId: req.user.companyId });
  if (!deleted) throw utils.createError(404, "Expense not found");
  return { message: "Expense deleted successfully" };
};
