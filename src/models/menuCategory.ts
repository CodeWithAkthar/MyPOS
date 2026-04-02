import { model } from "mongoose";
import menuCategorySchema from "./menuCategory.schema";

const MenuCategoryModel = model<menuCategorySchema>("menu_categories", menuCategorySchema);

export default MenuCategoryModel;


