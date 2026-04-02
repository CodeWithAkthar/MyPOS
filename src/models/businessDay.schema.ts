import mongoose, { Schema } from "mongoose";
import { BusinessDay } from "../types/businessDay";

type businessDaySchema = BusinessDay;

const businessDaySchema = new Schema(
  {
    companyId: { type: mongoose.Schema.ObjectId, required: true, ref: "companies" },
    brandId: { type: mongoose.Schema.ObjectId, required: true, ref: "brands" },
    outletId: { type: mongoose.Schema.ObjectId, required: true, ref: "outlets" },
    startingBalance: { type: Number, required: true, min: 0 },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.ObjectId, required: true, ref: "users" },
    closedBy: { type: mongoose.Schema.ObjectId, ref: "users" },
    remarks: { type: String, default: null },
    closingBalance: { type: Number, default: null, min: 0 },
    totalSales: { type: Number, default: 0, min: 0 },
    totalDiscounts: { type: Number, default: 0, min: 0 },
    deliveryCharge: { type: Number, default: 0, min: 0 },
    totalCash: { type: Number, default: 0, min: 0 },
    totalCard: { type: Number, default: 0, min: 0 },
    totalUpi: { type: Number, default: 0, min: 0 },
    totalExpense: { type: Number, default: 0, min: 0 },
    netSales: { type: Number, default: 0 },
    netTotal: { type: Number, default: 0 },
    variance: { type: Number, default: 0 },
  },
  { timestamps: true },
);

businessDaySchema.index({ companyId: 1, outletId: 1, startedAt: -1 });
businessDaySchema.index({ companyId: 1, brandId: 1, outletId: 1, endedAt: 1 });

export default businessDaySchema;
