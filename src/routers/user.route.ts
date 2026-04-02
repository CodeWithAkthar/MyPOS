import { Router } from "express";
import makeExpressCallback from "../middlewares/makeExpressCallback";
import * as userController from "../controllers/user.controller";
import { mustLogin, roleAccess } from "../middlewares/auth";
import { UserRole } from "../types/user";

const userRouter = Router();

// TODO: Remove/make it protected (Temp route for development).
userRouter.post('/addAdminUser', makeExpressCallback(userController.addAdminUser));

userRouter.post("/", roleAccess(UserRole.ADMIN), makeExpressCallback(userController.addUser));
userRouter.get("/", mustLogin, makeExpressCallback(userController.getAllUsers));
userRouter.put("/:userId", mustLogin, makeExpressCallback(userController.updateUser));
userRouter.get("/:userId", mustLogin, makeExpressCallback(userController.getUserById));
userRouter.delete("/:userId", roleAccess(UserRole.ADMIN), makeExpressCallback(userController.deleteUser));

export default userRouter;
