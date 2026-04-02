import { model } from "mongoose";
import expenseSchema from "./expense.schema";

const ExpenseModel = model<expenseSchema>("expenses", expenseSchema);

export default ExpenseModel;
