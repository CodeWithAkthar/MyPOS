export enum ActiveStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
}

export type Brand = {
  _id?: string;
  name: string;
  status?: ActiveStatus;
  companyId: string;
  createdAt?: string;
  updatedAt?: string;
};
