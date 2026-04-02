import { Router } from "express";
import { addUserWithJwtToRequest, mustLogin, roleAccess } from "../middlewares/auth";
import { UserRole } from "../types/user";
import * as companyController from "../controllers/company.controller";
import makeExpressCallback from "../middlewares/makeExpressCallback";

const router = Router();

// GET /company - Get company (requires authentication)
router.get("/", mustLogin, makeExpressCallback(companyController.getCompany));

// POST /company - Create company (requires admin role)
router.post("/", mustLogin, roleAccess(UserRole.ADMIN), makeExpressCallback(companyController.createCompany));

// PUT /company - Update company (requires admin role)
router.put("/", mustLogin, roleAccess(UserRole.ADMIN), makeExpressCallback(companyController.updateCompany));

export default router;
