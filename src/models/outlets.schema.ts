import mongoose, { Schema } from "mongoose";
import { Outlet } from "../types/outlet";
import { ActiveStatus } from "../types/brand";

type outletsSchema = Outlet;

const outletsSchema = new Schema(
  {
    name: { type: String, required: [true, "Name is required for outlet"] },
    status: {
      type: String,
      enum: Object.values(ActiveStatus),
      default: ActiveStatus.ACTIVE,
    },
    brandId: { type: mongoose.Schema.ObjectId, required: true, ref: "brands" },
    companyId: { type: mongoose.Schema.ObjectId, required: true, ref: "companies" },
    timeZone: { type: String, required: [true, "Time zone is required for outlet"] },
    address: { type: String, required: false },
    phoneNumber: { type: String, required: false },
    logo: { type: String, required: false },
  },
  {
    timestamps: true,
  },
);

export default outletsSchema;
