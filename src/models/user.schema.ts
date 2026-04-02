import mongoose, { Document, Schema } from "mongoose";
import { User, UserRole } from "../types/user";

type userSchema = User & Document;

const userSchema = new Schema(
  {
    name: { type: String },
    photoURL: { type: String },
    username: { type: String, required: true },
    password: { type: String, required: true },
    companyId: { type: mongoose.Schema.ObjectId, ref: "companies" },
    brandId: { type: mongoose.Schema.ObjectId, ref: "brands" },
    outletId: { type: mongoose.Schema.ObjectId, ref: "outlets" },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.WAITER,
    },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  },
);

// Common query and uniqueness indexes
userSchema.index({ companyId: 1 });
userSchema.index({ brandId: 1 });
userSchema.index({ outletId: 1 });
userSchema.index({ role: 1 });
userSchema.index({ companyId: 1, role: 1 });
userSchema.index({ companyId: 1, brandId: 1 });
userSchema.index({ companyId: 1, outletId: 1 });
// Company-scoped username uniqueness
userSchema.index({ companyId: 1, username: 1 }, { unique: true });

// Add indexes for search performance
userSchema.index({ name: 1 }); // User name search (used in order listing)
userSchema.index({ email: 1 }); // Email lookup
userSchema.index({ username: 1, companyId: 1 }); // Login queries

export default userSchema;
