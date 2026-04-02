import { Router } from "express";
import { mustLogin } from "../middlewares/auth";
import makeExpressCallback from "../middlewares/makeExpressCallback";
import * as orderHistoryController from "../controllers/orderHistory.controller";

const router = Router();

router.get("/", mustLogin, makeExpressCallback(orderHistoryController.getOrderHistory));

export default router;
