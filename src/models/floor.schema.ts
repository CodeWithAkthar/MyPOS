import mongoose, { Schema } from "mongoose";
import { Floor } from "../types/floor";

type floorSchema = Floor;

const floorSchema = new Schema(
  {
    name: { type: String, required: [true, "Name is required for the floor"] },
    displayOrder: { type: Number, required: [true, "Display Order required for the floor"] },
    outletId: { type: mongoose.Schema.ObjectId, required: true, ref: "outlets" },
    brandId: { type: mongoose.Schema.ObjectId, required: true, ref: "brands" },
    companyId: { type: mongoose.Schema.ObjectId, required: true, ref: "companies" },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  },
);

export default floorSchema;
