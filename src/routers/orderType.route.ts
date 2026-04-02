import { Router } from "express";
import { mustLogin, roleAccess } from "../middlewares/auth";
import { UserRole } from "../types/user";
import makeExpressCallback from "../middlewares/makeExpressCallback";
import * as orderTypeController from "../controllers/orderType.controller";

const router = Router();

// GET /order-types?brandId=&outletId=
router.get("/", mustLogin, makeExpressCallback(orderTypeController.getAllOrderTypes));

// PUT /order-types/:type
router.put("/:type", mustLogin, roleAccess(UserRole.ADMIN), makeExpressCallback(orderTypeController.updateOrderType));

export default router;


