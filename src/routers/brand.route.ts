import { Router } from "express";
import { addUserWithJwtToRequest, mustLogin, roleAccess } from "../middlewares/auth";
import { UserRole } from "../types/user";
import * as brandController from "../controllers/brand.controller";
import makeExpressCallback from "../middlewares/makeExpressCallback";

const router = Router();

// GET /brands - Get all brands (requires authentication)
router.get("/", mustLogin, makeExpressCallback(brandController.getBrands));

// GET /brands/:id - Get brand by ID (requires authentication)
router.get("/:id", mustLogin, makeExpressCallback(brandController.getBrandById));

// POST /brands - Create brand (requires admin role)
router.post("/", mustLogin, roleAccess(UserRole.ADMIN), makeExpressCallback(brandController.createBrand));

// PUT /brands/:id - Update brand (requires admin role)
router.put("/:id", mustLogin, roleAccess(UserRole.ADMIN), makeExpressCallback(brandController.updateBrand));

// DELETE /brands/:id - Delete brand (requires admin role)
router.delete("/:id", mustLogin, roleAccess(UserRole.ADMIN), makeExpressCallback(brandController.deleteBrand));

export default router;
