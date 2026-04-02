import { Router } from "express";
import { mustLogin, roleAccess } from "../middlewares/auth";
import { UserRole } from "../types/user";
import makeExpressCallback from "../middlewares/makeExpressCallback";
import * as menuCategoryController from "../controllers/menuCategory.controller";

const router = Router();

// GET /menu/categories?outletId=
router.get("/", mustLogin, makeExpressCallback(menuCategoryController.listCategories));

// GET /menu/categories/:id?outletId=
router.get("/:id", mustLogin, makeExpressCallback(menuCategoryController.getCategoryById));

// POST /menu/categories (admin and cashier)
router.post("/", mustLogin, roleAccess(UserRole.ADMIN, UserRole.CASHIER), makeExpressCallback(menuCategoryController.createCategory));

// PUT /menu/categories/:id (admin and cashier)
router.put("/:id", mustLogin, roleAccess(UserRole.ADMIN, UserRole.CASHIER), makeExpressCallback(menuCategoryController.updateCategory));

// DELETE /menu/categories/:id (admin and cashier)
router.delete("/:id", mustLogin, roleAccess(UserRole.ADMIN, UserRole.CASHIER), makeExpressCallback(menuCategoryController.deleteCategory));

export default router;
