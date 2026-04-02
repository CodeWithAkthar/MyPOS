import { model } from "mongoose";
import menuItemSchema from "./menuItem.schema";

const MenuItemModel = model<menuItemSchema>("menu_items", menuItemSchema);

export default MenuItemModel;


