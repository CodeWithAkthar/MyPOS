import { Router } from "express";
import { mustLogin, roleAccess } from "../middlewares/auth";
import { UserRole } from "../types/user";
import * as expenseCategoryController from "../controllers/expenseCategory.controller";
import makeExpressCallback from "../middlewares/makeExpressCallback";

const router = Router();

router.get("/", mustLogin, makeExpressCallback(expenseCategoryController.listExpenseCategories));
router.post(
  "/",
  mustLogin,
  roleAccess(UserRole.ADMIN, UserRole.CASHIER),
  makeExpressCallback(expenseCategoryController.createExpenseCategory),
);
router.put(
  "/:id",
  mustLogin,
  roleAccess(UserRole.ADMIN, UserRole.CASHIER),
  makeExpressCallback(expenseCategoryController.updateExpenseCategory),
);
router.delete(
  "/:id",
  mustLogin,
  roleAccess(UserRole.ADMIN, UserRole.CASHIER),
  makeExpressCallback(expenseCategoryController.deleteExpenseCategory),
);

export default router;
