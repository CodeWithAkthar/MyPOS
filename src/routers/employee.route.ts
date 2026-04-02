import { Router } from "express";
import { mustLogin, roleAccess } from "../middlewares/auth";
import { UserRole } from "../types/user";
import * as employeeController from "../controllers/employee.controller";
import makeExpressCallback from "../middlewares/makeExpressCallback";

const router = Router();

// List employees
router.get("/", mustLogin, makeExpressCallback(employeeController.listEmployees));

// Get employee by id
router.get("/:id", mustLogin, makeExpressCallback(employeeController.getEmployeeById));

// Create employee (admin only)
router.post("/", mustLogin, roleAccess(UserRole.ADMIN), makeExpressCallback(employeeController.createEmployee));

// Update employee (admin only)
router.put("/:id", mustLogin, roleAccess(UserRole.ADMIN), makeExpressCallback(employeeController.updateEmployee));

// Delete employee (admin only)
router.delete("/:id", mustLogin, roleAccess(UserRole.ADMIN), makeExpressCallback(employeeController.deleteEmployee));

export default router;
