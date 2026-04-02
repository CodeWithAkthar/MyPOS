import { Router } from "express";
import { mustLogin, roleAccess } from "../middlewares/auth";
import { UserRole } from "../types/user";
import * as cancelReasonController from "../controllers/cancelReason.controller";
import makeExpressCallback from "../middlewares/makeExpressCallback";

const router = Router();

// Public (authenticated) list for users
router.get("/", mustLogin, makeExpressCallback(cancelReasonController.listCancelReasons));

// Admin/Cashier create and delete
router.post("/", mustLogin, roleAccess(UserRole.ADMIN, UserRole.CASHIER), makeExpressCallback(cancelReasonController.createCancelReason),);
router.delete("/:id", mustLogin, roleAccess(UserRole.ADMIN, UserRole.CASHIER), makeExpressCallback(cancelReasonController.deleteCancelReason),);

export default router;
