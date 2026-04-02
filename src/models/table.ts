import { model } from "mongoose";
import tableSchema from "./table.schema";
import { Table } from "../types/table";

const TableModel = model<Table>("tables", tableSchema as any);

export default TableModel;
