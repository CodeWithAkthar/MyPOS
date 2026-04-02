import { Router } from "express";
import makeExpressCallback from "../middlewares/makeExpressCallback";
import * as authController from "../controllers/auth.controller";

const authRouter = Router();

authRouter.post("/signin", makeExpressCallback(authController.signInUser));
authRouter.post("/logout", makeExpressCallback(authController.logoutUser));

export default authRouter;
