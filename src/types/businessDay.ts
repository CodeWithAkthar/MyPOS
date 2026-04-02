export type BusinessDay = {
  _id?: string;
  companyId: string;
  brandId: string;
  outletId: string;
  startingBalance: number; // opening balance
  startedAt: Date | string; // timestamp
  endedAt?: Date | string | null; // timestamp or null when open
  createdBy: string; // user who started the day
  closedBy?: string | null; // user who closed the day
  remarks?: string | null; // remarks added while closing the day
  closingBalance?: number | null;
  totalSales?: number; // sum of totalAmount (before discounts) for settled orders
  totalDiscounts?: number; // sum of all discount amounts
  deliveryCharge?: number; // sum of all delivery charges
  totalCash?: number;
  totalCard?: number;
  totalUpi?: number;
  totalExpense?: number; // sum of all expenses for the business day
  netSales?: number; // totalSales - discounts + deliveryCharge
  netTotal?: number; // netSales - totalExpense
  variance?: number; // closingBalance - (startingBalance + totalCash)
  createdAt?: string;
  updatedAt?: string;
};


