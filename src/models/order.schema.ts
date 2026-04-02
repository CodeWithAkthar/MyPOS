import mongoose, { Schema } from "mongoose";
import { Order, OrderStatus, PaymentStatus } from "../types/order";

type orderSchema = Order;

const orderItemSchema = new Schema(
  {
    itemId: { type: mongoose.Schema.ObjectId, required: true, ref: "menu_items" },
    name: { type: String },
    imageURL: { type: String },
    description: { type: String },
    note: { type: String },
    unitPrice: { type: Number, required: true, min: 0, default: 0 },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    totalAmount: { type: Number, default: 0, min: 0 },

    // mark item as void/cancelled
    isVoid: { type: Boolean, default: false },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.ObjectId, ref: "users" },
    voidReason: { type: String },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    // Common
    companyId: { type: mongoose.Schema.ObjectId, required: true, ref: "companies" },
    brandId: { type: mongoose.Schema.ObjectId, required: true, ref: "brands" },
    outletId: { type: mongoose.Schema.ObjectId, required: true, ref: "outlets" },

    // Order specifics
    businessDayId: { type: mongoose.Schema.ObjectId, ref: "business_days", required: true },
    orderTypeId: { type: mongoose.Schema.ObjectId, required: true, ref: "order_types" },
    items: { type: [orderItemSchema], default: [] },
    note: { type: String },
    isKot: { type: Boolean, default: false },
    isReceipt: { type: Boolean, default: false },
    isUpdated: { type: Boolean, default: false },
    status: { type: String, enum: Object.values(OrderStatus), default: OrderStatus.OPEN },

    // Discount & amounts
    discount: {
      discountType: { type: String, enum: ["amount", "percentage"] },
      discountValue: { type: Number, min: 0 },
      discountAmount: { type: Number, min: 0 },
    },
    totalAmount: { type: Number, required: true, min: 0, default: 0 },
    // Delivery charges at order level
    deliveryCharges: { type: Number, min: 0, default: 0 },
    netAmount: { type: Number, required: true, min: 0, default: 0 },
    paymentStatus: { type: String, enum: Object.values(PaymentStatus), default: PaymentStatus.PENDING },

    // Payment settlement details
    paymentSettlement: {
      upi: { type: Number, min: 0, default: 0 },
      card: { type: Number, min: 0, default: 0 },
      cash: { type: Number, min: 0, default: 0 },
      orderClosedBy: { type: mongoose.Schema.ObjectId, ref: "users" },
      totalAmount: { type: Number, min: 0, default: 0 },
      paidAmount: { type: Number, min: 0, default: 0 },
      netAmount: { type: Number, min: 0, default: 0 },
    },

    // Dine-in specific payload
    dineIn: {
      type: {
        tableName: { type: String },
        tableId: { type: mongoose.Schema.ObjectId, ref: "tables" },
        guestCount: { type: Number, min: 0 },
      },
    },

    // Delivery specific payload
    delivery: {
      type: {
        customerName: { type: String },
        phone: { type: String },
        address: { type: String },
      },
    },

    // Order number (sequential per outlet)
    orderNumber: { type: Number, required: true },

    // Audit users
    orderTakenBy: { type: mongoose.Schema.ObjectId, ref: "users" },
    orderClosedBy: { type: mongoose.Schema.ObjectId, ref: "users" },
    orderClosedRemark: { type: String, default: "" },
    orderCancelledBy: { type: mongoose.Schema.ObjectId, ref: "users" },
    orderCancelledAt: { type: Date },
    orderCancelledReasonId: { type: mongoose.Schema.ObjectId, ref: "cancel_reasons" },
  },
  { timestamps: true },
);

// Add indexes for optimal query performance
orderSchema.index({ companyId: 1, outletId: 1, businessDayId: 1 });
orderSchema.index({ companyId: 1, outletId: 1, createdAt: 1 });
orderSchema.index({ companyId: 1, outletId: 1, status: 1 });
orderSchema.index({ businessDayId: 1, paymentStatus: 1, status: 1 });
orderSchema.index({ orderNumber: 1, outletId: 1 });

// Additional indexes for search and filtering (added for performance optimization)
orderSchema.index({ "dineIn.tableName": 1 }); // Table name search
orderSchema.index({ "delivery.customerName": 1 }); // Customer name search
orderSchema.index({ orderTakenBy: 1, companyId: 1, outletId: 1 }); // Waiter filtering
orderSchema.index({ companyId: 1, outletId: 1, orderTypeId: 1 }); // Order type filtering

export default orderSchema;
