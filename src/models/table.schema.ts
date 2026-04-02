import mongoose, { Schema, Document } from "mongoose";
import { Table } from "../types/table";

type tableSchema = Table;

const tableSchema = new Schema(
  {
    name: { type: String, required: true },
    floorId: { type: Schema.Types.ObjectId, ref: "floors", required: true },
    brandId: { type: mongoose.Schema.ObjectId, required: true, ref: "brands" },
    companyId: { type: mongoose.Schema.ObjectId, required: true, ref: "companies" },
    outletId: { type: mongoose.Schema.ObjectId, required: true, ref: "outlets" },
    seatCapacity: { type: Number, required: true },
    displayOrder: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    isOccupied: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export default tableSchema;
