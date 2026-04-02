import mongoose, { Schema } from "mongoose";
import { ExpenseCategory } from "../types/expense";

type expenseCategorySchema = ExpenseCategory;

const expenseCategorySchema = new Schema(
  {
    name: { type: String, required: true },
    companyId: { type: mongoose.Schema.ObjectId, required: true, ref: "companies" },
    brandId: { type: mongoose.Schema.ObjectId, required: true, ref: "brands" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

expenseCategorySchema.index({ name: 1, companyId: 1, brandId: 1 }, { unique: true });

export default expenseCategorySchema;
