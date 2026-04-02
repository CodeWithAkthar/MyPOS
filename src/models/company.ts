import { model } from "mongoose";
import companySchema from "./company.schema";

const CompanyModel = model<companySchema>("companies", companySchema);

export default CompanyModel;
