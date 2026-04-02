import "./instrumentation";
import "./global";
import http from "http";
import express from "express";
import connectToDb from "./services/db.service";
import notFoundMiddleware from "./middlewares/notFound";
import errorHandlingMiddleware from "./middlewares/errorHandler";
import logger, { morganMiddleware } from "./services/logger.service";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import userRouter from "./routers/user.route";
import authRouter from "./routers/auth.route";
import companyRouter from "./routers/company.route";
import brandRouter from "./routers/brand.route";
import outletRouter from "./routers/outlet.route";
import floorRouter from "./routers/floor.route";
import tableRouter from "./routers/table.route";
import orderTypeRouter from "./routers/orderType.route";
import menuCategoryRouter from "./routers/menuCategory.route";
import menuItemRouter from "./routers/menuItem.route";
import uploadRouter from "./routers/upload.route";
import salesRouter from "./routers/sales.route";
import expenseCategoryRouter from "./routers/expenseCategory.route";
import expenseRouter from "./routers/expense.route";
import orderRouter from "./routers/order.route";
import businessDayRouter from "./routers/businessDay.route";
import orderHistoryRouter from "./routers/orderHistory.route";
import cancelReasonRouter from "./routers/cancelReason.route";
import { addUserWithJwtToRequest } from "./middlewares/auth";
import requestIdMiddleware from "./middlewares/requestId";
import registerShutdownHandlers from "./services/shutdown.service";
import "./services/metrics.service";
import getConfig from "./config";
import { swaggerSpec } from "./swagger";
// import path from "path";

// creating servers
const expressApp = express();
const server = http.createServer(expressApp);
const app = express.Router();
const config = getConfig();

connectToDb();

// lib middlewares
expressApp.set("trust proxy", true);
expressApp.use(helmet());
expressApp.use(requestIdMiddleware); // Generate request correlation ID
expressApp.use(morganMiddleware); // HTTP request logging
expressApp.use(express.json({ limit: "50mb" }));
expressApp.use(express.urlencoded({ limit: "10mb", extended: true, parameterLimit: 50000 }));
expressApp.use(cookieParser());
expressApp.use(cors(config.cors));

// custom middlewares
expressApp.use(addUserWithJwtToRequest);
expressApp.get("/api-docs.json", (_req, res) => res.json(swaggerSpec));
expressApp.use(config.server.baseUrl, app);
expressApp.use(notFoundMiddleware);
expressApp.use(errorHandlingMiddleware);

// staring server
const runningServer = server.listen(config.server.port, () => logger.info(`Server started on port ${config.server.port}`));

// Register graceful shutdown handlers
registerShutdownHandlers(runningServer);

// routes
app.use("/users", userRouter);
app.use("/auth", authRouter);
app.use("/company", companyRouter);
app.use("/brands", brandRouter);
app.use("/outlets", outletRouter);
app.use("/floors", floorRouter);
app.use("/tables", tableRouter);
app.use("/order-types", orderTypeRouter);
app.use("/menu/categories", menuCategoryRouter);
app.use("/menu/items", menuItemRouter);
app.use("/uploads", uploadRouter);
app.use("/expense/categories", expenseCategoryRouter);
app.use("/expenses", expenseRouter);
app.use("/orders", orderRouter);
app.use("/business-days", businessDayRouter);
app.use("/sales", salesRouter);
app.use("/order-history", orderHistoryRouter);
app.use("/cancel-reasons", cancelReasonRouter);
// app.use("/prom-metrics", metricsRouter);
