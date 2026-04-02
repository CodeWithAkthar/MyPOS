import { Router } from "express";
import { mustLogin } from "../middlewares/auth";
import makeExpressCallback from "../middlewares/makeExpressCallback";
import * as businessDayController from "../controllers/businessDay.controller";

const router = Router();

router.post("/start", mustLogin, makeExpressCallback(businessDayController.startBusinessDay));
router.get("/current", mustLogin, makeExpressCallback(businessDayController.getCurrentBusinessDay));
router.post("/close", mustLogin, makeExpressCallback(businessDayController.closeBusinessDay));
router.get("/data", mustLogin, makeExpressCallback(businessDayController.getBusinessDayData));
router.get("/", mustLogin, makeExpressCallback(businessDayController.listBusinessDays));

export default router;


