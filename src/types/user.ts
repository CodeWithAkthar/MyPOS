export type User = {
  _id?: string;
  name?: string;
  email?: string;
  username?: string;
  password?: string;
  photoURL?: string;
  companyId?: string;
  brandId?: string; // required for employee roles
  outletId?: string; // required for employee roles
  createdAt?: string;
  updatedAt?: string;
  role?: string;
  isActive?: boolean;
};

export enum UserRole {
  ADMIN = "admin",
  CASHIER = "cashier",
  WAITER = "waiter",
}

export function isUserRole(value: string): value is UserRole {
  return Object.values(UserRole).includes(value as UserRole);
}
// type User = Prettify<UserInterface>;
// type User = UserInterface;
