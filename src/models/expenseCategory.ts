import { model } from "mongoose";
import expenseCategorySchema from "./expenseCategory.schema";

const ExpenseCategoryModel = model<expenseCategorySchema>("expense_categories", expenseCategorySchema);

export default ExpenseCategoryModel;
