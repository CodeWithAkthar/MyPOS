export enum OrderFieldRequirement {
  REQUIRED = "required",
  OPTIONAL = "optional",
  NOT_REQUIRED = "not-required",
}

export enum OrderTypeKey {
  DINE_IN = "dine-in",
  TAKEAWAY = "takeaway",
  DELIVERY = "delivery",
}

export type OrderType = {
  _id?: string;
  companyId: string;
  brandId: string;
  outletId: string;
  type: OrderTypeKey;
  // Dine-in specific
  tableRequirement?: OrderFieldRequirement;
  guestCountRequirement?: OrderFieldRequirement;
  // Delivery specific
  customerNameRequirement?: OrderFieldRequirement;
  phoneNumberRequirement?: OrderFieldRequirement;
  // Common
  isActive: import("./brand").ActiveStatus;
  createdAt?: string;
  updatedAt?: string;
};


