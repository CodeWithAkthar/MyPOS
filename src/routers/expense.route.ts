import { Router } from "express";
import { mustLogin } from "../middlewares/auth";
import * as expenseController from "../controllers/expense.controller";
import makeExpressCallback from "../middlewares/makeExpressCallback";

const router = Router();

router.get("/", mustLogin, makeExpressCallback(expenseController.listExpenses));
router.get("/:id", mustLogin, makeExpressCallback(expenseController.getExpenseById));
router.post("/", mustLogin, makeExpressCallback(expenseController.createExpense));
router.put("/:id", mustLogin, makeExpressCallback(expenseController.updateExpense));
router.delete("/:id", mustLogin, makeExpressCallback(expenseController.deleteExpense));

export default router;
