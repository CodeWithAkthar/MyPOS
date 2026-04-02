import { Schema } from "mongoose";
import { Company } from "../types/company";

type companySchema = Company;

const companySchema = new Schema(
  {
    name: { type: String, required: [true, "Name is required for company"] },
    companyCode: { type: String, required: true, unique: true, length: 4 },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  {
    timestamps: true,
  },
);

export default companySchema;
