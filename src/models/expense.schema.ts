import mongoose, { Schema } from "mongoose";
import { Expense, PaymentType } from "../types/expense";

type expenseSchema = Expense;

const expenseSchema = new Schema(
  {
    companyId: { type: mongoose.Schema.ObjectId, required: true, ref: "companies" },
    outletId: { type: mongoose.Schema.ObjectId, required: true, ref: "outlets" },
    brandId: { type: mongoose.Schema.ObjectId, required: true, ref: "brands" },
    businessDayId: { type: mongoose.Schema.ObjectId, required: true, ref: "business_days" },
    categoryId: { type: mongoose.Schema.ObjectId, required: true, ref: "expense_categories" },
    amount: { type: Number, required: true, min: 0 },
    paymentType: { type: String, enum: Object.values(PaymentType), required: true },
    remarks: { type: String },
    date: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

export default expenseSchema;
