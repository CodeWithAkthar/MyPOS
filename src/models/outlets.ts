import { model } from "mongoose";
import outletsSchema from "./outlets.schema";

const OutletsModel = model<outletsSchema>("outlets", outletsSchema);

export default OutletsModel;
