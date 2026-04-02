export type Table = {
  name: string;
  floorId: string;
  companyId: string;
  brandId: string;
  outletId: string;
  seatCapacity: number;
  displayOrder: number;
  isActive?: boolean;
  isOccupied?: boolean;
  createdAt: Date;
  updatedAt: Date;
};
