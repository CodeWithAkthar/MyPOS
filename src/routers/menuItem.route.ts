import { Router } from "express";
import { mustLogin, roleAccess } from "../middlewares/auth";
import { UserRole } from "../types/user";
import makeExpressCallback from "../middlewares/makeExpressCallback";
import * as menuItemController from "../controllers/menuItem.controller";

const router = Router();

// GET /menu/items?outletId=&categoryId?=&isActive?
router.get("/", mustLogin, makeExpressCallback(menuItemController.listMenuItems));

// GET /menu/items/:id?outletId=
router.get("/:id", mustLogin, makeExpressCallback(menuItemController.getMenuItemById));

// POST /menu/items (admin and cashier)
router.post("/", mustLogin, roleAccess(UserRole.ADMIN, UserRole.CASHIER), makeExpressCallback(menuItemController.createMenuItem));

// PUT /menu/items/:id (admin and cashier)
router.put("/:id", mustLogin, roleAccess(UserRole.ADMIN, UserRole.CASHIER), makeExpressCallback(menuItemController.updateMenuItem));

// DELETE /menu/items/:id (admin and cashier)
router.delete("/:id", mustLogin, roleAccess(UserRole.ADMIN, UserRole.CASHIER), makeExpressCallback(menuItemController.deleteMenuItem));

export default router;
