import { model } from "mongoose";
import orderTypeSchema from "./orderType.schema";

const OrderTypeModel = model<orderTypeSchema>("order_types", orderTypeSchema);

export default OrderTypeModel;


