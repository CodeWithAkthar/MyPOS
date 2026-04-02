import { ActiveStatus } from "./brand";

export type Company = {
  _id?: string;
  name: string;
  companyCode?: string; // 4-digit unique letter code
  status?: ActiveStatus;
  createdAt?: string;
  updatedAt?: string;
};
