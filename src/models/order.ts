import { model } from "mongoose";
import orderSchema from "./order.schema";

const OrderModel = model<orderSchema>("orders", orderSchema);

export default OrderModel;
