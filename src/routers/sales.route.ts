import { Router } from "express";
import { mustLogin } from "../middlewares/auth";
import * as salesController from "../controllers/sales.controller";
import makeExpressCallback from "../middlewares/makeExpressCallback";

const router = Router();

router.get("/report", mustLogin, makeExpressCallback(salesController.getSalesReport));
router.get("/report/item-report", mustLogin, makeExpressCallback(salesController.getItemReport));
router.get("/report/top-selling-items", mustLogin, makeExpressCallback(salesController.getTopSellingItemsReport));
router.get("/report/category-report", mustLogin, makeExpressCallback(salesController.getCategoryReport));
router.get("/report/expense-report", mustLogin, makeExpressCallback(salesController.getExpenseReport));
router.get("/report/sales-margin-report", mustLogin, makeExpressCallback(salesController.getSalesMarginReport));
router.get("/daily-sales-report", mustLogin, makeExpressCallback(salesController.getDailySalesReport));
router.get("/hourly-sales-data", mustLogin, makeExpressCallback(salesController.getHourlySalesData));
router.get("/report/voided-orders-details", mustLogin, makeExpressCallback(salesController.getCancelledOrdersSummary));
router.get("/report/voided-items-details", mustLogin, makeExpressCallback(salesController.getCancelledItemsSummary));
// router.get("/report/voided-orders-details", mustLogin, makeExpressCallback(salesController.getVoidedOrdersDetails));

export default router;
