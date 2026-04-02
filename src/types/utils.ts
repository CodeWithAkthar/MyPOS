import { Request } from "express";
import { User } from "./user";

export interface RequestWithUser extends Request {
  user: User;
}

