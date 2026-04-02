import { model } from "mongoose";
import cancelReasonSchema from "./cancelReason.schema";

const CancelReasonModel = model("cancel_reasons", cancelReasonSchema);
export default CancelReasonModel;
