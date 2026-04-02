// ============================================
// ENUMS
// ============================================

export enum DiscountType {
  AMOUNT = "amount",
  PERCENTAGE = "percentage",
}

export enum OrderStatus {
  OPEN = "open",
  CLOSED = "closed",
  CANCELLED = "cancelled",
}

export enum PaymentStatus {
  PENDING = "pending",
  SETTLED = "settled",
}

// ============================================
// TYPES & INTERFACES
// ============================================

export type OrderItem = {
  itemId: string; // menu item id (ref: menu_items)
  name?: string; // snapshot name
  imageURL?: string; // snapshot image
  description?: string; // snapshot description
  note?: string; // special instructions for this item
  unitPrice: number; // snapshot price
  quantity: number; // min: 1
  totalAmount?: number; // unitPrice * quantity
  isVoid?: boolean; // mark item as cancelled/void
  voidedAt?: Date | string;
  voidedBy?: string; // user ID (ref: users)
  voidReason?: string;
};

export type Discount = {
  discountType: DiscountType | "amount" | "percentage";
  discountValue: number; // percentage (0-100) or absolute amount
  discountAmount: number; // calculated discount amount
};

export type PaymentSettlement = {
  upi: number; // amount paid via UPI
  card: number; // amount paid via card
  cash: number; // amount paid via cash
  orderClosedBy?: string; // user ID who closed the order (ref: users)
  totalAmount?: number; // total settlement amount
  paidAmount?: number;
  netAmount?: number; // explicit net amount for client convenience
};

// Input helper for creating/updating payments from client
export type OrderPaymentInput = {
  upi?: number;
  card?: number;
  cash?: number;
  amountPaid?: number; // optional lump-sum; if split omitted defaults to cash
};

export type DineInDetails = {
  tableName?: string;
  tableId?: string; // ref: tables
  guestCount?: number;
};

export type DeliveryDetails = {
  customerName?: string;
  phone?: string;
  address?: string;
};

export type Order = {
  _id?: string;

  // Common references
  companyId: string; // ref: companies
  brandId: string; // ref: brands
  outletId: string; // ref: outlets

  // Order specifics
  businessDayId: string; // ref: business_days
  orderTypeId: string; // ref: order_types
  items: OrderItem[];
  note?: string; // general order note
  isKot?: boolean; // whether KOT (Kitchen Order Ticket) is printed/marked
  isReceipt?: boolean; // whether receipt is printed/marked
  isUpdated?: boolean; // whether order has been updated after creation
  status: OrderStatus;

  // Discount & amounts
  discount?: Discount | null;
  totalAmount: number; // subtotal of all items
  deliveryCharges?: number; // delivery charges applied at order level
  netAmount: number; // totalAmount - discountAmount + deliveryCharges
  paymentStatus: PaymentStatus;

  // Payment settlement details
  paymentSettlement?: PaymentSettlement | null;

  // Order type specific payloads
  dineIn?: DineInDetails | null;
  delivery?: DeliveryDetails | null;

  // Order number (sequential per outlet)
  orderNumber: number;

  // Audit trail
  orderTakenBy?: string; // user ID (ref: users)
  orderClosedBy?: string; // user ID (ref: users)
  orderClosedRemark?: string; // remarks for order closure
  orderCancelledBy?: string; // user ID who cancelled the order (ref: users)
  orderCancelledAt?: string; // ISO timestamp
  orderCancelledReasonId?: string; // ref: cancel_reasons

  // Response-only fields (not stored in DB)
  elapsedTime?: number; // time elapsed since order creation in milliseconds

  // Timestamps
  createdAt?: string;
  updatedAt?: string;
};

// ============================================
// ADDITIONAL TYPE FOR CREATE/UPDATE
// ============================================

export type CreateOrderInput = Omit<
  Order,
  "_id" | "orderNumber" | "createdAt" | "updatedAt" | "status" | "paymentStatus" | "netAmount" | "paymentSettlement" | "elapsedTime"
> & {
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentSettlement?: Order["paymentSettlement"]; // input-friendly subset
  deliveryCharges?: number;
} & OrderPaymentInput; // allow top-level convenience fields too

export type UpdateOrderInput = Partial<
  Omit<
    Order,
    "_id" | "orderNumber" | "createdAt" | "updatedAt" | "companyId" | "brandId" | "outletId" | "paymentSettlement" | "elapsedTime"
  >
> & {
  paymentSettlement?: OrderPaymentInput; // input-friendly subset
  deliveryCharges?: number;
  orderCancelledReasonId?: string;
} & OrderPaymentInput;
