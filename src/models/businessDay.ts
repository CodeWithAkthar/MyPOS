import { model } from "mongoose";
import businessDaySchema from "./businessDay.schema";

const BusinessDayModel = model<businessDaySchema>("business_days", businessDaySchema);

export default BusinessDayModel;


