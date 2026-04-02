import { Router } from "express";
import { mustLogin } from "../middlewares/auth";
import makeExpressCallback from "../middlewares/makeExpressCallback";
import * as uploadController from "../controllers/upload.controller";

const router = Router();

// GET /upload-url?filename=...&contentType=...&prefix=optional/path/
router.get("/upload-url", mustLogin, makeExpressCallback(uploadController.getUploadUrl));

export default router;
