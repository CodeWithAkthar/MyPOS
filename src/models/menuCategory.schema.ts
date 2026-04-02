import mongoose, { Schema } from "mongoose";
import { ActiveStatus } from "../types/brand";
import { MenuCategory } from "../types/menuCategory";

type menuCategorySchema = MenuCategory;

const menuCategorySchema = new Schema(
  {
    companyId: { type: mongoose.Schema.ObjectId, ref: "companies", required: true },
    brandId: { type: mongoose.Schema.ObjectId, ref: "brands", required: true },
    outletId: { type: mongoose.Schema.ObjectId, ref: "outlets", required: true },
    name: { type: String, required: true },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: String, enum: Object.values(ActiveStatus), default: ActiveStatus.ACTIVE },
  },
  { timestamps: true },
);

menuCategorySchema.index({ companyId: 1, outletId: 1, displayOrder: 1 });
menuCategorySchema.index({ companyId: 1, outletId: 1, name: 1 });
menuCategorySchema.index({ isActive: 1 });
menuCategorySchema.index({ brandId: 1 });

export default menuCategorySchema;
