import { mustLogin, roleAccess } from "../middlewares/auth";
import makeExpressCallback from "../middlewares/makeExpressCallback";
import * as floorController from "../controllers/floor.controller"
import { UserRole } from "../types/user";
import { Router } from "express";

const router = Router();



// Create floor (admin and cashier)
router.post(
  "/",
  mustLogin,
  roleAccess(UserRole.ADMIN, UserRole.CASHIER),
  makeExpressCallback(floorController.createFloor)
);
router.get("/", mustLogin, makeExpressCallback(floorController.listFloors));

// Update floor (admin and cashier)
router.put("/:floorId", mustLogin, roleAccess(UserRole.ADMIN, UserRole.CASHIER), makeExpressCallback(floorController.updateFloor));

// Delete floor (admin and cashier)
router.delete("/:floorId", mustLogin, roleAccess(UserRole.ADMIN, UserRole.CASHIER), makeExpressCallback(floorController.deleteFloor));

export default router;