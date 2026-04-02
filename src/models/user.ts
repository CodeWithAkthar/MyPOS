import { model } from "mongoose";
import userSchema from "./user.schema";

const UserModel = model<userSchema>("users", userSchema);

export default UserModel;
