import mongoose, { Schema } from "mongoose";

const cancelReasonSchema = new Schema(
  {
    reason: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.ObjectId, ref: "users" },
    companyId: { type: mongoose.Schema.ObjectId, ref: "companies", required: true },
    brandId: { type: mongoose.Schema.ObjectId, ref: "brands", required: true },
    outletId: { type: mongoose.Schema.ObjectId, ref: "outlets", required: true },
  },
  { timestamps: true },
);

export default cancelReasonSchema;
