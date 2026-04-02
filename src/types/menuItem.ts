export type MenuItem = {
  _id?: string;
  companyId: string;
  brandId: string;
  outletId: string;
  categoryId: string;
  name: string;
  description?: string;
  imageURL?: string;
  price: number;
  displayOrder?: number;
  isActive: import("./brand").ActiveStatus;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};
