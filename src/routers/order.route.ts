import { Router } from "express";
import { mustLogin } from "../middlewares/auth";
import * as orderController from "../controllers/order.controller";
import makeExpressCallback from "../middlewares/makeExpressCallback";

const router = Router();

router.get("/", mustLogin, makeExpressCallback(orderController.listOrders));
router.get("/:orderId", mustLogin, makeExpressCallback(orderController.getOrderById));
router.post("/", mustLogin, makeExpressCallback(orderController.createOrder));
// Specific routes must come BEFORE generic /:orderId route
router.put("/:orderId/cancel", mustLogin, makeExpressCallback(orderController.cancelOrder));
router.put("/:orderId/close", mustLogin, makeExpressCallback(orderController.closeOrder));
// Generic update route comes last to avoid matching /cancel and /close
router.put("/:orderId", mustLogin, makeExpressCallback(orderController.updateOrder));

export default router;
