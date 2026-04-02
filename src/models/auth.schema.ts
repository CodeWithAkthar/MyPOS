import { Schema } from "mongoose";
import { AuthSession } from "../types/auth.types";

const authSchema = new Schema<AuthSession>(
  {
    uid: { type: String, required: true },
    token: { type: String, required: true },
    userAgent: { type: String },
  },
  {
    timestamps: true,
  },
);

export default authSchema;
