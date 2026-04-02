import { Router } from "express";
import { addUserWithJwtToRequest, mustLogin, roleAccess } from "../middlewares/auth";
import { UserRole } from "../types/user";
import * as outletController from "../controllers/outlet.controller";
import makeExpressCallback from "../middlewares/makeExpressCallback";

const router = Router();

// IMPORTANT: Specific routes must come BEFORE parameterized routes (:id)
// This prevents /import-categories from being caught by /:id route

// POST /outlets/import-categories - Import categories (and items) from another outlet
router.post("/import-categories", mustLogin, makeExpressCallback(outletController.checkAndCopyCategories));

// POST /outlets/import-menu - Alias for importing categories and menu items from another outlet
router.post("/import-menu", mustLogin, makeExpressCallback(outletController.checkAndCopyCategories));

// GET /outlets - Get all outlets (requires authentication)
router.get("/", mustLogin, makeExpressCallback(outletController.getOutlets));

// GET /outlets/:id - Get outlet by ID (requires authentication)
router.get("/:id", mustLogin, makeExpressCallback(outletController.getOutletById));

// POST /outlets - Create outlet (requires admin role)
router.post("/", mustLogin, roleAccess(UserRole.ADMIN), makeExpressCallback(outletController.createOutlet));

// PUT /outlets/:id - Update outlet (requires admin role)
router.put("/:id", mustLogin, roleAccess(UserRole.ADMIN), makeExpressCallback(outletController.updateOutlet));

// DELETE /outlets/:id - Delete outlet (requires admin role)
router.delete("/:id", mustLogin, roleAccess(UserRole.ADMIN), makeExpressCallback(outletController.deleteOutlet));

export default router;
