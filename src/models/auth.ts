import { model } from "mongoose";
import authSchema from "./auth.schema";
import { AuthSession } from "../types/auth.types";

const AuthModel = model<AuthSession>("auths", authSchema);

export default AuthModel;
