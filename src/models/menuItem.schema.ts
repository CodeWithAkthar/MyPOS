import mongoose, { Schema } from "mongoose";
import { ActiveStatus } from "../types/brand";
import { MenuItem } from "../types/menuItem";

type menuItemSchema = MenuItem;

const menuItemSchema = new Schema(
  {
    companyId: { type: mongoose.Schema.ObjectId, ref: "companies", required: true },
    brandId: { type: mongoose.Schema.ObjectId, ref: "brands", required: true },
    outletId: { type: mongoose.Schema.ObjectId, ref: "outlets", required: true },
    categoryId: { type: mongoose.Schema.ObjectId, ref: "menu_categories", required: true },
    name: { type: String, required: true },
    description: { type: String },
    imageURL: { type: String },
    price: { type: Number, required: true, min: 0 },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: String, enum: Object.values(ActiveStatus), default: ActiveStatus.ACTIVE },
    createdBy: { type: mongoose.Schema.ObjectId, ref: "users" },
  },
  { timestamps: true },
);

menuItemSchema.index({ companyId: 1, outletId: 1, categoryId: 1, name: 1 });
menuItemSchema.index({ companyId: 1, outletId: 1, categoryId: 1, displayOrder: 1 }); // For sorting items within categories
menuItemSchema.index({ companyId: 1 });
menuItemSchema.index({ brandId: 1 });
menuItemSchema.index({ outletId: 1 });
menuItemSchema.index({ categoryId: 1 });
menuItemSchema.index({ isActive: 1 });

export default menuItemSchema;
