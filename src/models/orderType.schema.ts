import mongoose, { Schema } from "mongoose";
import { ActiveStatus } from "../types/brand";
import { OrderFieldRequirement, OrderType, OrderTypeKey } from "../types/orderType";

type orderTypeSchema = OrderType;

const orderTypeSchema = new Schema(
  {
    companyId: { type: mongoose.Schema.ObjectId, ref: "companies", required: true },
    brandId: { type: mongoose.Schema.ObjectId, ref: "brands", required: true },
    outletId: { type: mongoose.Schema.ObjectId, ref: "outlets", required: true },
    type: { type: String, enum: Object.values(OrderTypeKey), required: true },
    typeId: { type: Number, default: 0 },
    tableRequirement: { type: String, enum: Object.values(OrderFieldRequirement) },
    guestCountRequirement: { type: String, enum: Object.values(OrderFieldRequirement) },
    customerNameRequirement: { type: String, enum: Object.values(OrderFieldRequirement) },
    phoneNumberRequirement: { type: String, enum: Object.values(OrderFieldRequirement) },
    addressRequirement: { type: String, enum: Object.values(OrderFieldRequirement) },

    isActive: { type: String, enum: Object.values(ActiveStatus), default: ActiveStatus.ACTIVE, required: true },
  },
  { timestamps: true },
);

orderTypeSchema.index({ companyId: 1, brandId: 1, outletId: 1, type: 1 });
orderTypeSchema.index({ companyId: 1 });
orderTypeSchema.index({ brandId: 1 });
orderTypeSchema.index({ outletId: 1 });

export default orderTypeSchema;
