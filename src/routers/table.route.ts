import { Router } from "express";
import { mustLogin, roleAccess } from "../middlewares/auth";
import makeExpressCallback from "../middlewares/makeExpressCallback";
import * as tableController from "../controllers/table.controller";
import { UserRole } from "../types/user";

const router = Router();

// Create a table (admin and cashier)
router.post(
  "/",
  mustLogin,
  roleAccess(UserRole.ADMIN, UserRole.CASHIER),
  makeExpressCallback(tableController.createTable)
);

// Update a table (admin and cashier)
router.put(
  "/:tableId",
  mustLogin,
  roleAccess(UserRole.ADMIN, UserRole.CASHIER),
  makeExpressCallback(tableController.updateTable)
);

// Delete a table (admin and cashier)
router.delete(
  "/:tableId",
  mustLogin,
  roleAccess(UserRole.ADMIN, UserRole.CASHIER),
  makeExpressCallback(tableController.deleteTable)
);

// List all tables or by floor
router.get(
  "/",
  mustLogin,
  makeExpressCallback(tableController.listTables)
);

export default router;
