export enum PaymentType {
  CASH = "cash",
  CARD = "card",
  UPI = "upi",
}

export type ExpenseCategory = {
  _id?: string;
  name: string;
  companyId: string;
  brandId: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type Expense = {
  _id?: string;
  companyId: string;
  outletId: string;
  brandId: string;
  businessDayId: string;
  categoryId: string;
  amount: number;
  paymentType: PaymentType | "cash" | "card" | "upi";
  remarks?: string;
  date?: string; // ISO date string
  businessDate?: string; // ISO date string from business day
  createdAt?: string;
  updatedAt?: string;
};
