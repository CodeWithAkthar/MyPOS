import mongoose, { Schema } from "mongoose";
import { Brand, ActiveStatus } from "../types/brand";

type brandSchema = Brand;

const brandSchema = new Schema(
  {
    name: { type: String, required: [true, "Name is required for brand"] },
    status: {
      type: String,
      enum: Object.values(ActiveStatus),
      default: ActiveStatus.ACTIVE,
    },
    companyId: { type: mongoose.Schema.ObjectId, required: true, ref: "companies" },
  },
  {
    timestamps: true,
  },
);

export default brandSchema;
