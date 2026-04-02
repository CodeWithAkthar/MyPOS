import mongoose from "mongoose";
import { RequestWithUser } from "../types/utils";
import Utils from "../utils";
import OrderModel from "../models/order";
import OutletsModel from "../models/outlets";
import OrderTypeModel from "../models/orderType";
import MenuItemModel from "../models/menuItem";
import BusinessDayModel from "../models/businessDay";
import CancelReasonModel from "../models/cancelReason";
import UserModel from "../models/user";
import {
  DiscountType,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  Discount,
  PaymentSettlement,
  CreateOrderInput,
  UpdateOrderInput,
  Order,
} from "../types/order";
import { OrderTypeKey } from "../types/orderType";
import { UserRole } from "../types/user";

const utils = new Utils();

// ============================================
// VALIDATION CACHE
// ============================================

// In-memory cache for outlet and order type validation
// These are called very frequently, so caching reduces DB load
const outletCache = new Map<string, any>();
const orderTypeCache = new Map<string, any>();

// ============================================
// VALIDATION HELPERS
// ============================================

class OrderValidator {
  static validateObjectId(id: string, fieldName: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw utils.createError(400, `Invalid ${fieldName}`);
    }
  }

  static validateRequiredField(value: any, fieldName: string): void {
    if (!value) {
      throw utils.createError(400, `${fieldName} is required`);
    }
  }

  static validateArray(value: any, fieldName: string): void {
    if (!Array.isArray(value)) {
      throw utils.createError(400, `${fieldName} must be an array`);
    }
  }

  static validateOrderStatus(status: string): void {
    if (!Object.values(OrderStatus).includes(status as OrderStatus)) {
      throw utils.createError(400, "Invalid order status");
    }
  }

  static validatePaymentStatus(status: string): void {
    if (!Object.values(PaymentStatus).includes(status as PaymentStatus)) {
      throw utils.createError(400, "Invalid payment status");
    }
  }

  static validateDiscount(discount: any, totalAmount: number): void {
    if (!discount) return;

    const { discountType, discountValue } = discount;

    if (!discountType || !Object.values(DiscountType).includes(discountType)) {
      throw utils.createError(400, "Invalid discount type");
    }

    if (discountValue === undefined || discountValue === null || discountValue < 0) {
      throw utils.createError(400, "Discount value must be a non-negative number");
    }

    if (discountType === DiscountType.PERCENTAGE) {
      if (discountValue > 100) {
        throw utils.createError(400, "Percentage discount cannot exceed 100%");
      }
    }

    if (discountType === DiscountType.AMOUNT) {
      if (discountValue > totalAmount) {
        throw utils.createError(400, "Discount amount cannot exceed total amount");
      }
    }
  }

  static validatePaymentAmounts(amounts: { upi?: number; card?: number; cash?: number }): void {
    const { upi = 0, card = 0, cash = 0 } = amounts;

    if (upi < 0 || card < 0 || cash < 0) {
      throw utils.createError(400, "Payment amounts cannot be negative");
    }

    if (!Number.isFinite(upi) || !Number.isFinite(card) || !Number.isFinite(cash)) {
      throw utils.createError(400, "Payment amounts must be valid numbers");
    }
  }

  static async validateOutletAccess(outletId: string, companyId: string): Promise<any> {
    this.validateObjectId(outletId, "outletId");

    // Check cache first
    const cacheKey = `${outletId}_${companyId}`;
    const cached = outletCache.get(cacheKey);
    if (cached) return cached;

    // Cache miss - fetch from database
    const outlet = await OutletsModel.findOne({ _id: outletId, companyId }).lean();
    if (!outlet) {
      throw utils.createError(404, "Outlet not found in your company");
    }

    // Store in cache
    outletCache.set(cacheKey, outlet);
    return outlet;
  }

  static async validateOrderTypeAccess(orderTypeId: string, companyId: string, outletId: string): Promise<any> {
    this.validateObjectId(orderTypeId, "orderTypeId");

    // Check cache first
    const cacheKey = `${orderTypeId}_${companyId}_${outletId}`;
    const cached = orderTypeCache.get(cacheKey);
    if (cached) return cached;

    // Cache miss - fetch from database
    const orderType = await OrderTypeModel.findOne({
      _id: orderTypeId,
      companyId,
      outletId,
    }).lean();
    if (!orderType) {
      throw utils.createError(404, "Order type not found for this outlet");
    }

    // Store in cache
    orderTypeCache.set(cacheKey, orderType);
    return orderType;
  }
}

// ============================================
// CALCULATION HELPERS
// ============================================

class OrderCalculator {
  /**
   * Calculate total amount from order items (excluding voided items)
   */
  static calculateTotalAmount(items: OrderItem[]): number {
    const total = items
      .filter((item) => !item.isVoid)
      .reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0), 0);

    return Number(total.toFixed(2));
  }

  /**
   * Calculate discount amount based on discount type
   */
  static calculateDiscountAmount(totalAmount: number, discount?: Discount | null): number {
    if (!discount || !discount.discountType || discount.discountValue === undefined) {
      return 0;
    }

    let amount = 0;

    if (discount.discountType === DiscountType.PERCENTAGE) {
      amount = (totalAmount * discount.discountValue) / 100;
    } else if (discount.discountType === DiscountType.AMOUNT) {
      amount = discount.discountValue;
    }

    return Number(amount.toFixed(2));
  }

  /**
   * Calculate net amount (totalAmount - discount)
   */
  static calculateNetAmountWithPaid(
    totalAmount: number = 0,
    discountAmount: number = 0,
    deliveryCharges: number = 0,
    paidAmount: number = 0,
  ): number {
    const netAmount = totalAmount - discountAmount + deliveryCharges - paidAmount;
    return Number(Math.max(0, netAmount).toFixed(2));
  }

  /**
   * Calculate total paid amount from payment methods
   */
  static calculateTotalPaid(settlement?: PaymentSettlement | null): number {
    if (!settlement) return 0;

    const total = (settlement.upi || 0) + (settlement.card || 0) + (settlement.cash || 0);
    return Number(total.toFixed(2));
  }

  /**
   * Check if order is fully settled
   */
  static isOrderSettled(netAmount: number, totalPaid: number): boolean {
    return totalPaid >= netAmount && netAmount >= 0;
  }
}

// ============================================
// ORDER ITEM PROCESSING
// ============================================

class OrderItemProcessor {
  /**
   * Normalize and validate order items against menu items
   */
  static async normalizeOrderItems(items: any[], companyId: string, outletId: string): Promise<OrderItem[]> {
    OrderValidator.validateArray(items, "items");

    if (items.length === 0) {
      throw utils.createError(400, "Order must contain at least one item");
    }

    const itemIds = items.map((item) => item.itemId).filter(Boolean);

    if (itemIds.length === 0) {
      throw utils.createError(400, "All items must have a valid itemId");
    }

    // Fetch menu items from database
    const menuItems = await MenuItemModel.find({
      _id: { $in: itemIds },
      companyId,
      outletId,
    });

    const menuItemMap = new Map(menuItems.map((item) => [String(item._id), item]));

    // Normalize each item
    const normalizedItems: OrderItem[] = items.map((item) => {
      const menuItem = menuItemMap.get(String(item.itemId));

      if (!menuItem) {
        throw utils.createError(400, `Menu item ${item.itemId} not found or doesn't belong to this outlet`);
      }

      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw utils.createError(400, `Invalid quantity for item ${menuItem.name}`);
      }

      const unitPrice = Number(menuItem.price);
      const totalAmount = unitPrice * quantity;

      return {
        itemId: String(item.itemId),
        name: menuItem.name,
        imageURL: menuItem.imageURL,
        description: menuItem.description,
        unitPrice,
        quantity,
        note: item.note || undefined,
        totalAmount: Number(totalAmount.toFixed(2)),
        isVoid: Boolean(item.isVoid),
        voidReason: item.voidReason || undefined,
        // Preserve existing void details if passed (though usually set in controller)
        voidedAt: item.voidedAt,
        voidedBy: item.voidedBy,
      };
    });

    return normalizedItems;
  }
}

// ============================================
// ORDER TYPE PAYLOAD BUILDER
// ============================================

class OrderTypePayloadBuilder {
  /**
   * Build dineIn/delivery payloads based on order type
   */
  static buildPayloads(
    orderType: any,
    requestBody: any,
  ): {
    dineIn: any;
    delivery: any;
  } {
    if (!orderType) {
      return { dineIn: null, delivery: null };
    }

    const orderTypeKey = orderType.type as OrderTypeKey;

    switch (orderTypeKey) {
      case OrderTypeKey.DINE_IN:
        return this.buildDineInPayload(requestBody);

      case OrderTypeKey.DELIVERY:
        return this.buildDeliveryPayload(requestBody);

      default:
        // Takeaway or other types
        return { dineIn: null, delivery: null };
    }
  }

  private static buildDineInPayload(body: any) {
    const dineInData = body?.dineIn || {};

    return {
      dineIn: {
        tableName: dineInData.tableName || undefined,
        tableId: dineInData.tableId || undefined,
        guestCount: dineInData.guestCount ? Number(dineInData.guestCount) : undefined,
      },
      delivery: null,
    };
  }

  private static buildDeliveryPayload(body: any) {
    const deliveryData = body?.delivery || {};

    return {
      dineIn: null,
      delivery: {
        customerName: deliveryData.customerName || undefined,
        phone: deliveryData.phone || undefined,
        address: deliveryData.address || undefined,
      },
    };
  }
}

// ============================================
// DISCOUNT PROCESSOR
// ============================================

class DiscountProcessor {
  /**
   * Process and validate discount, returning computed discount object
   */
  static processDiscount(discount: any, totalAmount: number): Discount | null {
    if (!discount || !discount.discountType) {
      return null;
    }

    OrderValidator.validateDiscount(discount, totalAmount);

    const discountAmount = OrderCalculator.calculateDiscountAmount(totalAmount, discount);

    return {
      discountType: discount.discountType,
      discountValue: Number(discount.discountValue),
      discountAmount,
    };
  }
}

// ============================================
// PAYMENT PROCESSOR
// ============================================

class PaymentProcessor {
  /**
   * Process payment and determine settlement status
   */
  static processPayment(
    netAmount: number,
    paymentData: {
      upi?: number;
      card?: number;
      cash?: number;
      paidAmount?: number;
      totalAmount?: number;
    },
    userId: string,
    existingSettlement?: PaymentSettlement | null,
  ): {
    paymentSettlement: PaymentSettlement;
    paymentStatus: PaymentStatus;
    orderStatus: OrderStatus;
  } {
    // Validate payment amounts
    OrderValidator.validatePaymentAmounts(paymentData);

    const upi = Number(paymentData.upi || 0);
    const card = Number(paymentData.card || 0);
    let cash = Number(paymentData.cash || 0);

    // If amountPaid is provided without breakdown, default to cash
    if (paymentData.paidAmount !== undefined && paymentData.paidAmount !== null) {
      const amount = Number(paymentData.paidAmount);

      if (!Number.isFinite(amount) || amount < 0) {
        throw utils.createError(400, "paidAmount must be a non-negative number");
      }

      // If no payment method specified, default to cash
      if (!paymentData.upi && !paymentData.card && !paymentData.cash) {
        cash = amount;
      }
    }

    const totalPaid = OrderCalculator.calculateTotalPaid({ upi, card, cash, totalAmount: netAmount });

    // Prevent overpayment - user cannot pay more than the net amount
    if (totalPaid > netAmount) {
      throw utils.createError(400, `Payment amount (${totalPaid}) cannot exceed net amount (${netAmount})`);
    }

    const isSettled = OrderCalculator.isOrderSettled(netAmount, totalPaid);

    const paymentSettlement: PaymentSettlement = {
      upi,
      card,
      cash,
      netAmount,
      totalAmount: paymentData.totalAmount || 0,
      paidAmount: totalPaid,
      orderClosedBy: isSettled ? userId : existingSettlement?.orderClosedBy || undefined,
    };

    return {
      paymentSettlement,
      paymentStatus: isSettled ? PaymentStatus.SETTLED : PaymentStatus.PENDING,
      // Keep order status as OPEN even when payment is settled - only close manually
      orderStatus: isSettled ? OrderStatus.CLOSED : OrderStatus.OPEN,
    };
  }

  static async processPaymentNew(
    order: Order,
    userId: string,
    orderToUpdate?: Order,
  ): Promise<{
    paymentSettlement: PaymentSettlement;
    discount: Discount | null;
    paymentStatus: PaymentStatus;
    orderStatus: OrderStatus;
  }> {
    const paymentData = {
      upi: 0,
      card: 0,
      cash: 0,
      netAmount: 0,
      paidAmount: 0,
      totalAmount: 0,
      ...(order?.paymentSettlement ? order.paymentSettlement : {}),
    };

    // Validate payment amounts
    OrderValidator.validatePaymentAmounts(paymentData);

    const upi = Number(paymentData.upi || 0);
    const card = Number(paymentData.card || 0);
    let cash = Number(paymentData.cash || 0);

    // If amountPaid is provided without breakdown, default to cash
    if (paymentData.paidAmount !== undefined && paymentData.paidAmount !== null) {
      const amount = Number(paymentData.paidAmount);

      if (!Number.isFinite(amount) || amount < 0) {
        throw utils.createError(400, "amountPaid must be a non-negative number");
      }

      // If no payment method specified, default to cash
      if (!paymentData.upi && !paymentData.card && !paymentData.cash) {
        cash = amount;
      }
    }

    const totalAmount = OrderCalculator.calculateTotalAmount(order.items);
    const discount = DiscountProcessor.processDiscount(order.discount, totalAmount);
    const totalPaid = OrderCalculator.calculateTotalPaid({ upi, card, cash });
    const netAmount = OrderCalculator.calculateNetAmountWithPaid(totalAmount, discount?.discountAmount!, order.deliveryCharges, totalPaid);
    const totalPayable = OrderCalculator.calculateNetAmountWithPaid(totalAmount, discount?.discountAmount!, order.deliveryCharges, 0);

    // Prevent overpayment - user cannot pay more than the net amount
    if (totalPaid > totalPayable) {
      throw utils.createError(400, `Payment amount (${totalPaid}) cannot exceed net amount (${totalPayable})`);
    }

    const isSettled = OrderCalculator.isOrderSettled(totalPayable, totalPaid);

    const paymentSettlement: PaymentSettlement = {
      upi,
      card,
      cash,
      netAmount: totalPayable,
      totalAmount,
      paidAmount: totalPaid,
      orderClosedBy: isSettled ? userId : order?.orderClosedBy || undefined,
    };

    const paymentResult = {
      paymentSettlement,
      discount,
      paymentStatus: isSettled ? PaymentStatus.SETTLED : PaymentStatus.PENDING,
      orderStatus: isSettled ? OrderStatus.CLOSED : OrderStatus.OPEN, // TODO: Check if this need to be updated or not
    };

    if (orderToUpdate) {
      orderToUpdate.paymentSettlement = paymentSettlement;
      orderToUpdate.paymentStatus = paymentResult.paymentStatus;
      orderToUpdate.status = paymentResult.orderStatus;
      orderToUpdate.totalAmount = paymentResult.paymentSettlement.totalAmount!;
      orderToUpdate.netAmount = paymentResult.paymentSettlement.netAmount!;
      // orderToUpdate.paidAmount = paymentResult.paymentSettlement.paidAmount;

      if (paymentResult.discount !== null) {
        orderToUpdate.discount = paymentResult.discount;
      }

      if (paymentResult.orderStatus === OrderStatus.CLOSED) {
        orderToUpdate.orderClosedBy = paymentResult.paymentSettlement.orderClosedBy;
      }
    }

    return paymentResult;
  }
}

// ============================================
// ORDER ASSERTIONS
// ============================================

class OrderAssertion {
  /**
   * Assert order exists and is editable
   */
  static async assertOrderEditable(orderId: string, companyId: string): Promise<any> {
    const order = await OrderModel.findOne({ _id: orderId, companyId });

    if (!order) {
      throw utils.createError(404, "Order not found");
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw utils.createError(400, "Cannot edit a cancelled order");
    }

    // if (order.status === OrderStatus.CLOSED) {
    //   throw utils.createError(400, "Cannot edit a closed order");
    // }

    return order?.toJSON?.() || order || null;
  }

  /**
   * Assert order can be cancelled
   */
  static async assertOrderCancellable(orderId: string, companyId: string): Promise<any> {
    const order = await OrderModel.findOne({ _id: orderId, companyId });

    if (!order) {
      throw utils.createError(404, "Order not found");
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw utils.createError(400, "Order is already cancelled");
    }

    return order;
  }

  /**
   * Assert order can be closed
   */
  static async assertOrderClosable(orderId: string, companyId: string): Promise<any> {
    const order = await OrderModel.findOne({ _id: orderId, companyId });

    if (!order) {
      throw utils.createError(404, "Order not found");
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw utils.createError(400, "Cannot close a cancelled order");
    }

    if (order.status === OrderStatus.CLOSED) {
      throw utils.createError(400, "Order is already closed");
    }

    return order;
  }

  /**
   * Assert order exists
   */
  static async assertOrderExists(orderId: string, companyId: string): Promise<any> {
    const order = await OrderModel.findOne({ _id: orderId, companyId });

    if (!order) {
      throw utils.createError(404, "Order not found");
    }

    return order;
  }
}

// ============================================
// ORDER POPULATION
// ============================================

class OrderPopulator {
  static async populateOrder(orderId: string): Promise<any> {
    const order = await OrderModel.findById(orderId)
      .lean() // Return plain JavaScript object for better performance
      .populate({ path: "companyId", options: { lean: true } })
      .populate({ path: "outletId", options: { lean: true } })
      .populate({ path: "brandId", options: { lean: true } })
      .populate({ path: "orderTypeId", options: { lean: true } })
      .populate({ path: "orderTakenBy", select: "_id name email", options: { lean: true } })
      .populate({ path: "orderClosedBy", select: "_id name email", options: { lean: true } })
      .populate({ path: "orderCancelledBy", select: "_id name email", options: { lean: true } })
      .populate({ path: "orderCancelledReasonId", options: { lean: true } });

    if (!order) return null;

    return this.formatOrderResponse(order);
  }

  /**
   * Format order response with consistent ID fields and populated data
   */
  static formatOrderResponse(order: any): any {
    // Calculate elapsed time in milliseconds
    const elapsedTime = order.createdAt ? Date.now() - new Date(order.createdAt).getTime() : 0;

    const formattedOrder: any = {
      _id: order._id?.toString(),

      // Company
      companyId: order.companyId?._id?.toString() || order.companyId?.toString(),
      companyData: order.companyId?._id ? order.companyId : null,

      // Brand
      brandId: order.brandId?._id?.toString() || order.brandId?.toString(),
      brandData: order.brandId?._id ? order.brandId : null,

      // Outlet
      outletId: order.outletId?._id?.toString() || order.outletId?.toString(),
      outletData: order.outletId?._id ? order.outletId : null,

      // Business Day
      businessDayId: order.businessDayId?.toString(),

      // Order Type
      orderTypeId: order.orderTypeId?._id?.toString() || order.orderTypeId?.toString(),
      orderTypeData: order.orderTypeId?._id ? order.orderTypeId : null,

      // Order details
      items: order.items,
      note: order.note,
      isKot: order.isKot,
      isReceipt: order.isReceipt,
      status: order.status,

      // Amounts
      totalAmount: order.totalAmount,
      deliveryCharges: order.deliveryCharges ?? order.paymentSettlement?.deliveryCharges ?? 0,
      netAmount: order.netAmount,
      discount: order.discount,

      // Payment
      paymentStatus: order.paymentStatus,
      paymentSettlement: order.paymentSettlement,
      paymentType:
        [
          (order.paymentSettlement?.upi || 0) > 0 ? "UPI" : null,
          (order.paymentSettlement?.card || 0) > 0 ? "CARD" : null,
          (order.paymentSettlement?.cash || 0) > 0 ? "CASH" : null,
        ]
          .filter(Boolean)
          .join(",") || null,

      // Order type specific data
      dineIn: order.dineIn,
      delivery: order.delivery,

      // Order metadata
      orderNumber: order.orderNumber,

      // Audit fields
      orderTakenBy: order.orderTakenBy?._id?.toString() || order.orderTakenBy?.toString(),
      orderTakenByData: order.orderTakenBy?._id ? order.orderTakenBy : null,

      orderClosedBy: order.orderClosedBy?._id?.toString() || order.orderClosedBy?.toString(),
      orderClosedByData: order.orderClosedBy?._id ? order.orderClosedBy : null,

      orderCancelledBy: order.orderCancelledBy?._id?.toString() || order.orderCancelledBy?.toString(),
      orderCancelledByData: order.orderCancelledBy?._id ? order.orderCancelledBy : null,
      orderCancelledAt: order.orderCancelledAt ? order.orderCancelledAt?.toISOString?.() || order.orderCancelledAt : null,
      orderCancelledReasonId: order.orderCancelledReasonId?._id?.toString?.() || order.orderCancelledReasonId?.toString?.() || null,
      orderCancelledReasonData: order.orderCancelledReasonId?._id ? order.orderCancelledReasonId : null,

      // Response-only fields
      elapsedTime,

      // Timestamps
      createdAt: order.createdAt?.toISOString?.() || order.createdAt,
      updatedAt: order.updatedAt?.toISOString?.() || order.updatedAt,
    };

    return formattedOrder;
  }

  /**
   * Format multiple orders
   */
  static formatOrderListResponse(orders: any[]): any[] {
    return orders.map((order) => this.formatOrderResponse(order));
  }

  /**
   * Format lightweight order list items with only mandatory fields for getAllOrders API
   */
  static formatOrderListLiteResponse(orders: any[]): any[] {
    return orders.map((order) => {
      const elapsedTime = order.createdAt ? Date.now() - new Date(order.createdAt).getTime() : 0;

      // Determine a simple payment type label based on amounts paid
      const upi = order.paymentSettlement?.upi || 0;
      const card = order.paymentSettlement?.card || 0;
      const cash = order.paymentSettlement?.cash || 0;
      let paymentType: string | null = null;
      const methodsUsed = [upi > 0 ? "UPI" : null, card > 0 ? "CARD" : null, cash > 0 ? "CASH" : null].filter(Boolean) as string[];
      if (methodsUsed.length === 1) paymentType = methodsUsed[0];
      else if (methodsUsed.length > 1) paymentType = "MIXED";
      else paymentType = null;

      // Takeaway when both dineIn and delivery are absent
      const takeAwayDetails = !order.dineIn && !order.delivery ? {} : null;

      return {
        _id: order._id?.toString(),

        // identifiers
        orderId: order._id?.toString(),
        orderNo: order.orderNumber,

        // order type details
        OrderTypeDetails: order.orderTypeId?._id ? order.orderTypeId : order.orderTypeData || null,

        // dine/delivery/takeaway
        dineInDetials: order.dineIn || null,
        deliveryDetails: order.delivery || null,
        takeAwayDetails,

        // status flags
        isKot: order.isKot,
        isReceipt: order.isReceipt,

        // amounts
        amount: order.netAmount,

        // Order metadata
        orderNumber: order.orderNumber,

        // timing
        elapsedTime,

        // audit
        orderTakenBy: order.orderTakenBy?._id || order.orderTakenBy || null,
        orderTakenByData: order.orderTakenBy?._id ? order.orderTakenBy : null,
        orderClosedBy: order.orderClosedBy?._id || order.orderClosedBy || null,
        orderClosedByData: order.orderClosedBy?._id ? order.orderClosedBy : null,

        // payment
        paymentType,
        paymentStatus: order.paymentStatus,
        paymentSettlement: order.paymentSettlement,

        // cancel info
        voidedBy: order.orderCancelledBy?._id || order.orderCancelledBy || null,
        voidReason: order.orderCancelledReasonId?._id || order.orderCancelledReasonId || null,
        voidTime: order.orderCancelledAt || null,
        orderCancelledBy: order.orderCancelledBy?._id || order.orderCancelledBy || null,
        orderCancelledByData: order.orderCancelledBy?._id ? order.orderCancelledBy : null,
        orderCancelledAt: order.orderCancelledAt || null,
        orderCancelledReasonId: order.orderCancelledReasonId?._id?.toString?.() || order.orderCancelledReasonId?.toString?.() || null,
      };
    });
  }
}

// ============================================
// BUSINESS DAY SERVICE
// TODO: Move to separate module - services/businessDay.service.ts
// ============================================

class BusinessDayService {
  static async getOpenBusinessDay(outletId: string, companyId: string): Promise<any> {
    const openDay = await BusinessDayModel.findOne({
      companyId,
      outletId,
      endedAt: null,
    });

    if (!openDay) {
      throw utils.createError(400, "No open business day for this outlet. Please start the day first.");
    }

    return openDay;
  }

  static async generateNextOrderNumber(outletId: string, companyId: string, businessDayId: string): Promise<number> {
    const lastOrder = await OrderModel.findOne({
      outletId,
      companyId,
      businessDayId,
    })
      .sort({ orderNumber: -1 })
      .select("orderNumber");

    return lastOrder?.orderNumber ? lastOrder.orderNumber + 1 : 1;
  }
}

// ============================================
// MAIN ORDER SERVICE - CREATE ORDER
// ============================================

export const createOrder = async (req: RequestWithUser) => {
  // Validate user has company
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company");
  }

  // Extract request body - maintain input structure
  const body = req.body as CreateOrderInput;
  const { outletId, orderTypeId, items, note, isKot, discount, deliveryCharges, paymentSettlement } = body;

  // Validate required fields
  OrderValidator.validateRequiredField(outletId, "outletId");
  OrderValidator.validateRequiredField(orderTypeId, "orderTypeId");
  OrderValidator.validateRequiredField(items, "items");

  // Validate outlet access
  const outlet = await OrderValidator.validateOutletAccess(outletId, req.user.companyId);

  // Validate order type
  const orderType = await OrderValidator.validateOrderTypeAccess(orderTypeId, req.user.companyId, outletId);

  // Get open business day
  const businessDay = await BusinessDayService.getOpenBusinessDay(outletId, req.user.companyId);

  // Normalize order items (fetch menu item details)
  const normalizedItems = await OrderItemProcessor.normalizeOrderItems(items, req.user.companyId, outletId);

  // Build order type specific payloads (dineIn/delivery)
  const { dineIn: dineInPayload, delivery: deliveryPayload } = OrderTypePayloadBuilder.buildPayloads(orderType, req.body);

  // Generate sequential order number
  const orderNumber = await BusinessDayService.generateNextOrderNumber(outletId, req.user.companyId, String(businessDay._id));

  const createOrderData: Order = {
    companyId: req.user.companyId,
    brandId: outlet.brandId,
    outletId,
    businessDayId: businessDay._id,
    orderTypeId,
    items: normalizedItems,
    note: note || undefined,
    isKot: Boolean(isKot),
    isReceipt: false,
    status: OrderStatus.OPEN,
    dineIn: dineInPayload,
    delivery: deliveryPayload,
    orderNumber,
    orderTakenBy: req.user._id,
    paymentStatus: PaymentStatus.PENDING,
    totalAmount: 0,
    deliveryCharges,
    netAmount: 0,
    discount,
    paymentSettlement,
  };

  // if (createOrderData.paymentSettlement) {
  await PaymentProcessor.processPaymentNew(createOrderData, req?.user?._id!, createOrderData);
  // }

  // Create order document
  const createdOrder = await OrderModel.create(createOrderData);

  // Return populated order
  return await OrderPopulator.populateOrder(String(createdOrder._id));
};

// ============================================
// GET ORDER BY ID
// ============================================

export const getOrderById = async (req: RequestWithUser) => {
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company");
  }

  const { orderId } = req.params;
  OrderValidator.validateObjectId(orderId, "orderId");

  const order = await OrderModel.findOne({
    _id: orderId,
    companyId: req.user.companyId,
  })
    .lean() // Return plain JavaScript object for better performance
    .populate({ path: "companyId", options: { lean: true } })
    .populate({ path: "outletId", options: { lean: true } })
    .populate({ path: "brandId", options: { lean: true } })
    .populate({ path: "orderTypeId", options: { lean: true } })
    .populate({ path: "orderTakenBy", select: "_id name email", options: { lean: true } })
    .populate({ path: "orderClosedBy", select: "_id name email", options: { lean: true } })
    .populate({ path: "orderCancelledBy", select: "_id name email", options: { lean: true } })
    .populate({ path: "orderCancelledReasonId", options: { lean: true } });

  if (!order) {
    throw utils.createError(404, "Order not found");
  }

  return OrderPopulator.formatOrderResponse(order);
};

// ============================================
// LIST ORDERS
// ============================================

export const listOrders = async (req: RequestWithUser) => {
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company");
  }

  const {
    outletId,
    businessDayId,
    status,
    paymentStatus,
    isKot,
    isReceipt,
    page = "1",
    limit = "10",
    orderType,
    orderTypeId,
    search,
  } = req.query;

  // Validate required outlet
  OrderValidator.validateRequiredField(outletId, "outletId");
  await OrderValidator.validateOutletAccess(outletId as string, req.user.companyId);

  // Parse and validate pagination parameters
  const pageNumber = parseInt(page as string, 10);
  const limitNumber = parseInt(limit as string, 10);

  if (isNaN(pageNumber) || pageNumber < 1) {
    throw utils.createError(400, "Invalid page number. Must be >= 1");
  }

  if (isNaN(limitNumber) || limitNumber < 1 || limitNumber > 100) {
    throw utils.createError(400, "Invalid limit. Must be between 1 and 100");
  }

  // Build filter
  const filter: any = {
    companyId: req.user.companyId,
    outletId,
  };

  // Role-based visibility: waiters see only their own orders
  if (req.user?.role === UserRole.WAITER && req.user?._id) {
    filter.orderTakenBy = req.user._id;
  }

  if (businessDayId) {
    OrderValidator.validateObjectId(businessDayId as string, "businessDayId");
    filter.businessDayId = businessDayId;
  }

  if (status) {
    OrderValidator.validateOrderStatus(status as string);
    filter.status = status;
  }

  if (paymentStatus) {
    OrderValidator.validatePaymentStatus(paymentStatus as string);
    filter.paymentStatus = paymentStatus;
  }

  if (isKot !== undefined) {
    filter.isKot = isKot === "true";
  }

  if (isReceipt !== undefined) {
    filter.isReceipt = isReceipt === "true";
  }

  // Search by order number, customer name, table name/number, or order taken by (name)
  if (typeof search === "string" && search.trim() !== "") {
    const searchRegex = new RegExp(search, "i");
    const orConditions: any[] = [];

    const searchNumber = parseInt(search, 10);
    if (!isNaN(searchNumber)) {
      orConditions.push({ orderNumber: searchNumber });
    }

    // Customer name (delivery)
    orConditions.push({ "delivery.customerName": searchRegex });

    // Table name/number captured in dineIn.tableName
    orConditions.push({ "dineIn.tableName": searchRegex });

    // Order taken by (user name) -> find matching user ids and filter by orderTakenBy
    const matchedUsers = await UserModel.find({ name: searchRegex }, { _id: 1 }).lean();
    const matchedUserIds = matchedUsers.map((u: any) => u._id);
    if (matchedUserIds.length > 0) {
      orConditions.push({ orderTakenBy: { $in: matchedUserIds } });
    }

    if (orConditions.length > 0) {
      (filter as any).$or = orConditions;
    }
  }

  // Filter by order type(s) - either by type name or by ID, not both
  if (orderType !== undefined && orderType !== null && orderTypeId !== undefined && orderTypeId !== null) {
    throw utils.createError(400, "Cannot use both orderType and orderTypeId filters. Please use only one.");
  }

  // Filter by order type name (dine-in, takeaway, delivery)
  if (orderType !== undefined && orderType !== null) {
    const rawValues = Array.isArray(orderType) ? (orderType as string[]) : String(orderType).split(",");

    // Normalize input to enum keys (lowercase, hyphenated)
    const normalized = rawValues.map((s) => s.toString().trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean);

    const allowed = Object.values(OrderTypeKey) as string[];
    const validTypes = normalized.filter((t) => allowed.includes(t));

    if (validTypes.length === 0) {
      throw utils.createError(400, `Invalid orderType. Allowed: ${allowed.join(", ")}`);
    }

    const typeDocs = await OrderTypeModel.find(
      {
        companyId: req.user.companyId,
        outletId: outletId as string,
        type: { $in: validTypes as any },
      },
      { _id: 1 },
    );

    const typeIds = typeDocs.map((d) => d._id);
    // If none found, force no results
    filter.orderTypeId = typeIds.length > 0 ? { $in: typeIds } : { $in: [] };
  }

  // Filter by order type ID(s) directly
  if (orderTypeId !== undefined && orderTypeId !== null) {
    const rawIds = Array.isArray(orderTypeId) ? (orderTypeId as string[]) : String(orderTypeId).split(",");
    const trimmedIds = rawIds.map((id) => id.toString().trim()).filter(Boolean);

    // Validate all IDs
    for (const id of trimmedIds) {
      OrderValidator.validateObjectId(id, "orderTypeId");
    }

    filter.orderTypeId = trimmedIds.length === 1 ? trimmedIds[0] : { $in: trimmedIds };
  }

  // Calculate skip value for pagination
  const skip = (pageNumber - 1) * limitNumber;

  // Parallelize count and find queries for better performance
  const [totalOrders, orders] = await Promise.all([
    OrderModel.countDocuments(filter),
    OrderModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .lean() // Return plain JavaScript objects for better performance
      .populate({ path: "companyId", options: { lean: true } })
      .populate({ path: "outletId", options: { lean: true } })
      .populate({ path: "brandId", options: { lean: true } })
      .populate({ path: "orderTypeId", options: { lean: true } })
      .populate({ path: "orderTakenBy", select: "_id name email", options: { lean: true } })
      .populate({ path: "orderClosedBy", select: "_id name email", options: { lean: true } })
      .populate({ path: "orderCancelledBy", select: "_id name email", options: { lean: true } })
      .populate({ path: "orderCancelledReasonId", options: { lean: true } }),
  ]);

  // Calculate pagination metadata
  const totalPages = Math.ceil(totalOrders / limitNumber);
  const hasNextPage = pageNumber < totalPages;
  const hasPrevPage = pageNumber > 1;

  // Return paginated response
  return {
    data: OrderPopulator.formatOrderListResponse(orders),
    pagination: {
      currentPage: pageNumber,
      totalPages,
      totalOrders,
      limit: limitNumber,
      hasNextPage,
      hasPrevPage,
      nextPage: hasNextPage ? pageNumber + 1 : null,
      prevPage: hasPrevPage ? pageNumber - 1 : null,
    },
  };
};

// ============================================
// UPDATE ORDER - PUT OPERATION
// Handles: items, note, orderType, dineIn/delivery details, discount
// ============================================

export const updateOrder = async (req: RequestWithUser) => {
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company");
  }

  const { orderId } = req.params;
  OrderValidator.validateObjectId(orderId, "orderId");

  // Assert order is editable (not settled/closed)
  const existingOrder = await OrderAssertion.assertOrderEditable(orderId, req.user.companyId);

  // Extract update fields - maintain input structure
  const body = req.body as UpdateOrderInput;
  const { items, note, orderTypeId, isKot, isReceipt, discount, dineIn, delivery, status, deliveryCharges, paymentSettlement } = body;

  const updateData: any = existingOrder;

  // Update note
  if (note !== undefined) {
    updateData.note = note || undefined;
  }

  // Update isKot flag
  if (isKot !== undefined) {
    updateData.isKot = Boolean(isKot);
  }

  // Update isReceipt flag
  if (isReceipt !== undefined) {
    updateData.isReceipt = Boolean(isReceipt);
  }

  // Update status
  if (status !== undefined) {
    OrderValidator.validateOrderStatus(status);

    // Handle status-specific logic
    if (status === OrderStatus.CANCELLED) {
      // For cancellation, require orderCancelledBy
      if (!req.user._id) {
        throw utils.createError(400, "User ID is required for order cancellation");
      }
      updateData.orderCancelledBy = req.user._id;
      updateData.orderCancelledAt = new Date();

      // Optional cancel reason id
      const { reasonId } = (req.body || {}) as any;
      if (reasonId !== undefined && reasonId !== null) {
        if (!mongoose.Types.ObjectId.isValid(reasonId)) {
          throw utils.createError(400, "Invalid cancel reason id");
        }
        const reason = await CancelReasonModel.findOne({
          _id: reasonId,
          companyId: req.user.companyId,
          brandId: existingOrder.brandId,
          outletId: existingOrder.outletId,
        });
        if (!reason) throw utils.createError(404, "Cancel reason not found for this outlet");
        updateData.orderCancelledReasonId = reasonId;
      }
    } else if (status === OrderStatus.CLOSED) {
      // For closing, require orderClosedBy
      if (!req.user._id) {
        throw utils.createError(400, "User ID is required for order closure");
      }
      updateData.orderClosedBy = req.user._id;
    }

    updateData.status = status;
  }

  if (items !== undefined) {
    OrderValidator.validateArray(items, "items");
    const normalizedItems = await OrderItemProcessor.normalizeOrderItems(items, req?.user?.companyId!, req?.user?.outletId!);

    // Process voided items
    const existingItems = existingOrder.items || [];
    const claimedIndices = new Set<number>();

    updateData.items = normalizedItems.map((item) => {
      if (item.isVoid) {
        let matched = false;

        // If client provided voidedAt, try to match with an existing voided item
        if (item.voidedAt) {
          const itemVoidTime = new Date(item.voidedAt).getTime();

          const existingIndex = existingItems.findIndex((existingItem: any, index: number) => {
            if (claimedIndices.has(index)) return false;
            if (!existingItem.isVoid || !existingItem.voidedAt) return false;
            if (String(existingItem.itemId) !== item.itemId) return false;

            const existingVoidTime = new Date(existingItem.voidedAt).getTime();
            // Allow small time difference or exact match? Exact match should work if client echoes.
            return Math.abs(existingVoidTime - itemVoidTime) < 1000; // 1s tolerance
          });

          if (existingIndex !== -1) {
            claimedIndices.add(existingIndex);
            matched = true;
            // Keep existing details
            item.voidedAt = existingItems[existingIndex].voidedAt;
            item.voidedBy = existingItems[existingIndex].voidedBy;
            // voidReason can be updated by client, so we keep item.voidReason or fallback
            if (!item.voidReason) item.voidReason = existingItems[existingIndex].voidReason;
          }
        }

        if (!matched) {
          // New void or invalid claim - set current user and time
          item.voidedAt = new Date();
          item.voidedBy = req.user._id;
          // item.voidReason is already set from input
        }
      } else {
        // Not void - ensure void fields are cleared
        delete item.voidedAt;
        delete item.voidedBy;
        delete item.voidReason;
      }
      return item;
    });
  }

  if (discount !== undefined) {
    updateData.discount = discount;
  }

  // Update order type and rebuild payloads
  if (orderTypeId !== undefined) {
    const orderType = await OrderValidator.validateOrderTypeAccess(orderTypeId, req.user.companyId, existingOrder.outletId);

    updateData.orderTypeId = orderTypeId;

    // Rebuild payloads based on new order type
    const { dineIn: dineInPayload, delivery: deliveryPayload } = OrderTypePayloadBuilder.buildPayloads(orderType, req.body);

    updateData.dineIn = dineInPayload;
    updateData.delivery = deliveryPayload;
  } else {
    // Update payloads for existing order type if provided
    if (dineIn !== undefined || delivery !== undefined) {
      const orderType = await OrderTypeModel.findById(existingOrder.orderTypeId);

      if (orderType) {
        const { dineIn: dineInPayload, delivery: deliveryPayload } = OrderTypePayloadBuilder.buildPayloads(orderType, req.body);

        if (dineIn !== undefined) {
          updateData.dineIn = dineInPayload;
        }
        if (delivery !== undefined) {
          updateData.delivery = deliveryPayload;
        }
      }
    }
  }

  if (deliveryCharges !== undefined) {
    updateData.deliveryCharges = Number(deliveryCharges || 0);
  }

  if (paymentSettlement !== undefined) {
    existingOrder.paymentSettlement = paymentSettlement;
    await PaymentProcessor.processPaymentNew(existingOrder, req?.user?._id!, updateData);
  }

  // Mark order as updated
  updateData.isUpdated = true;

  // Perform update
  const updatedOrder = await OrderModel.findOneAndUpdate(
    { _id: orderId, companyId: req.user.companyId },
    { $set: updateData },
    { new: true, runValidators: true },
  );

  if (!updatedOrder) {
    throw utils.createError(404, "Order not found");
  }

  return await OrderPopulator.populateOrder(String(orderId));
};

// ============================================
// CANCEL ORDER - Dedicated endpoint for order cancellation
// ============================================

export const cancelOrder = async (req: RequestWithUser) => {
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company");
  }

  const { orderId } = req.params;
  OrderValidator.validateObjectId(orderId, "orderId");

  // Assert order can be cancelled
  const existingOrder = await OrderAssertion.assertOrderCancellable(orderId, req.user.companyId);

  // Optional cancel reason id in body
  const { reasonId } = (req.body || {}) as any;
  let reasonObjectId: any = undefined;
  if (reasonId !== undefined && reasonId !== null) {
    if (!mongoose.Types.ObjectId.isValid(reasonId)) {
      throw utils.createError(400, "Invalid cancel reason id");
    }
    const reasonExists = await CancelReasonModel.findOne({
      _id: reasonId,
      companyId: req.user.companyId,
      brandId: existingOrder.brandId,
      outletId: existingOrder.outletId,
    });
    if (!reasonExists) throw utils.createError(404, "Cancel reason not found for this outlet");
    reasonObjectId = reasonId;
  }

  // Update order to cancelled status with metadata
  const cancelledOrder = await OrderModel.findOneAndUpdate(
    { _id: orderId, companyId: req.user.companyId },
    {
      $set: {
        status: OrderStatus.CANCELLED,
        orderCancelledBy: req.user._id,
        orderCancelledAt: new Date(),
        ...(reasonObjectId ? { orderCancelledReasonId: reasonObjectId } : {}),
      },
    },
    { new: true, runValidators: true },
  );

  if (!cancelledOrder) {
    throw utils.createError(404, "Order not found");
  }

  return await OrderPopulator.populateOrder(String(orderId));
};

// ============================================
// CLOSE ORDER - Dedicated endpoint for order closure
// ============================================

export const closeOrder = async (req: RequestWithUser) => {
  if (!req.user.companyId) {
    throw utils.createError(400, "User must have a company");
  }

  const { orderId, remark } = req.params;
  OrderValidator.validateObjectId(orderId, "orderId");

  // Assert order can be closed
  const existingOrder = await OrderAssertion.assertOrderClosable(orderId, req.user.companyId);

  // Update order to closed status
  const closedOrder = await OrderModel.findOneAndUpdate(
    { _id: orderId, companyId: req.user.companyId },
    {
      $set: {
        status: OrderStatus.CLOSED,
        orderClosedBy: req.user._id,
        orderClosedRemark: remark,
      },
    },
    { new: true, runValidators: true },
  );

  if (!closedOrder) {
    throw utils.createError(404, "Order not found");
  }

  return await OrderPopulator.populateOrder(String(orderId));
};
