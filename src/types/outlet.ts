import { ActiveStatus } from "./brand";

export type Outlet = {
  _id?: string;
  name: string;
  status?: ActiveStatus;
  brandId: string;
  companyId: string;
  timeZone: string;
  address?: string;
  phoneNumber?: string;
  logo?: string;
  createdAt?: string;
  updatedAt?: string;
};
