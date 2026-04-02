export type MenuCategory = {
  _id?: string;
  companyId: string;
  brandId: string;
  outletId: string;
  name: string;
  displayOrder: number;
  isActive?: import("./brand").ActiveStatus;
  createdAt?: string;
  updatedAt?: string;
};


