import { model } from "mongoose";
import floorSchema from "./floor.schema";
const FloorModel = model<floorSchema>("floors", floorSchema);

export default FloorModel;
