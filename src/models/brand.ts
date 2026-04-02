import { model } from "mongoose";
import brandSchema from "./brand.schema";

const BrandModel = model<brandSchema>("brands", brandSchema);

export default BrandModel;
