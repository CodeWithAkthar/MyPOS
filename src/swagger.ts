import swaggerJSDoc from "swagger-jsdoc";

const swaggerDefinition: swaggerJSDoc.OAS3Definition = {
  openapi: "3.0.3",
  info: {
    title: "POS Backend API",
    version: "1.0.0",
    description:
      "API documentation for POS backend.\n\nRole-based visibility: waiter users only see orders they have taken; cashier and admin users see all orders for the outlet. All reports and history endpoints respect this scoping.",
  },
  servers: [
    {
      url: "/",
      description: "Base server",
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      BusinessDay: {
        type: "object",
        description: "Business day financial summary with real-time aggregated data",
        properties: {
          _id: { type: "string" },
          companyId: { type: "string" },
          brandId: { type: "string" },
          outletId: { type: "string" },
          startingBalance: { type: "number", description: "Opening balance at the start of the business day" },
          startedAt: { type: "string", format: "date-time" },
          endedAt: { type: "string", format: "date-time", nullable: true },
          createdBy: { type: "string" },
          closedBy: { type: "string", nullable: true },
          closingBalance: { type: "number", nullable: true },
          remarks: { type: "string", nullable: true },
          totalSales: { type: "number", description: "Gross sales (before discounts) = sum of all order totalAmounts" },
          totalDiscounts: { type: "number", description: "Total discount amounts given during the business day" },
          deliveryCharge: { type: "number", description: "Total delivery charges collected during the business day" },
          totalCash: { type: "number", description: "Total cash payments received" },
          totalCard: { type: "number", description: "Total card payments received" },
          totalUpi: { type: "number", description: "Total UPI payments received" },
          totalPayments: {
            type: "number",
            description: "Total of all payments (totalCash + totalCard + totalUpi) - should equal netSales",
          },
          totalExpense: { type: "number", description: "Sum of all expenses during the business day" },
          netSales: {
            type: "number",
            description:
              "Net sales after discounts and delivery charges = sum of all order netAmounts = totalSales - totalDiscounts + deliveryCharge = totalPayments",
          },
          netTotal: { type: "number", description: "Final net total after expenses = netSales - totalExpense + startingBalance" },
          variance: { type: "number", description: "Variance = closingBalance - netTotal" },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        },
      },
      DiscountType: { type: "string", enum: ["amount", "percentage"] },
      OrderStatus: { type: "string", enum: ["open", "closed", "cancelled"] },
      PaymentStatus: { type: "string", enum: ["pending", "settled"] },
      PaymentSettlement: {
        type: "object",
        nullable: true,
        properties: {
          orderClosedBy: { type: "string", description: "User ID who closed the order" },
          upi: { type: "number", minimum: 0, description: "Amount paid via UPI" },
          card: { type: "number", minimum: 0, description: "Amount paid via card" },
          cash: { type: "number", minimum: 0, description: "Amount paid via cash" },
          totalAmount: { type: "number", minimum: 0, description: "Order subtotal (sum of item unitPrice * quantity)" },
          paidAmount: { type: "number", minimum: 0, description: "Total amount paid across all methods" },
          netAmount: { type: "number", minimum: 0, description: "Net amount for the order (duplicated for convenience)" },
        },
        description: "Payment settlement details. Null if payment is not settled.",
      },
      PaymentInput: {
        type: "object",
        properties: {
          amountPaid: { type: "number", description: "Optional lump-sum; if methods omitted, defaults to cash (legacy field)" },
          paidAmount: {
            type: "number",
            description: "Optional lump-sum; if methods omitted, defaults to cash (new field used by update API)",
          },
          upi: { type: "number", description: "Amount paid via UPI" },
          card: { type: "number", description: "Amount paid via card" },
          cash: { type: "number", description: "Amount paid via cash" },
          totalAmount: { type: "number", description: "Order total amount" },
        },
        description: "Client-side payment input for create/update requests.",
      },
      OrderItem: {
        type: "object",
        properties: {
          itemId: { type: "string" },
          name: { type: "string" },
          imageURL: { type: "string" },
          description: { type: "string" },
          unitPrice: { type: "number" },
          quantity: { type: "number" },
          note: { type: "string" },
          totalAmount: { type: "number" },
          isVoid: { type: "boolean", description: "Whether the item is voided/cancelled" },
        },
        required: ["itemId", "unitPrice", "quantity"],
      },
      Order: {
        type: "object",
        properties: {
          _id: { type: "string" },
          companyId: { type: "string" },
          companyData: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/Company" }] },
          brandId: { type: "string" },
          brandData: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/Brand" }] },
          outletId: { type: "string" },
          outletData: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/Outlet" }] },
          orderTypeId: { type: "string" },
          orderTypeData: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/OrderType" }] },
          items: { type: "array", items: { $ref: "#/components/schemas/OrderItem" } },
          note: { type: "string" },
          isKot: { type: "boolean", description: "Whether KOT is marked", default: false },
          isReceipt: { type: "boolean", description: "Whether receipt is marked" },
          isUpdated: { type: "boolean", description: "Whether order has been updated after creation", default: false },
          totalAmount: { type: "number" },
          deliveryCharges: { type: "number" },
          netAmount: { type: "number", description: "Remaining payable: totalAmount - discountAmount + deliveryCharges - paidAmount" },
          status: { $ref: "#/components/schemas/OrderStatus" },
          paymentStatus: { $ref: "#/components/schemas/PaymentStatus" },
          paymentType: { type: "string", nullable: true, description: "Comma-separated methods used: UPI,CARD,CASH (null if none)" },
          discount: {
            type: "object",
            nullable: true,
            properties: {
              discountType: { $ref: "#/components/schemas/DiscountType" },
              discountValue: { type: "number", minimum: 0 },
              discountAmount: { type: "number", minimum: 0 },
            },
            required: ["discountType", "discountValue", "discountAmount"],
            description: "Discount applied to the order. Null if no discount.",
          },
          dineIn: {
            type: "object",
            nullable: true,
            properties: {
              tableName: { type: "string" },
              tableId: { type: "string" },
              guestCount: { type: "number", minimum: 0 },
            },
            description: "Dine-in specific information. Null if not dine-in order.",
          },
          delivery: {
            type: "object",
            nullable: true,
            properties: {
              customerName: { type: "string" },
              phone: { type: "string" },
              address: { type: "string" },
            },
            description: "Delivery specific information. Null if not delivery order.",
          },
          orderNumber: { type: "number", description: "Sequential order number per outlet" },
          businessDayId: { type: "string", description: "Business day associated with the order" },
          orderTakenBy: { type: "string", description: "User ID who took the order" },
          orderTakenByData: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/User" }] },
          orderClosedBy: { type: "string", description: "User ID who closed the order" },
          orderClosedByData: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/User" }] },
          orderCancelledBy: { type: "string", description: "User ID who cancelled the order" },
          orderCancelledByData: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/User" }] },
          orderCancelledAt: { oneOf: [{ type: "null" }, { type: "string", format: "date-time" }] },
          orderCancelledReasonId: { oneOf: [{ type: "null" }, { type: "string" }] },
          orderCancelledReasonData: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/CancelReason" }] },
          paymentSettlement: { $ref: "#/components/schemas/PaymentSettlement" },
          elapsedTime: { type: "number", description: "Time elapsed since order creation in seconds" },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        },
      },
      CancelReason: {
        type: "object",
        properties: {
          _id: { type: "string" },
          reason: { type: "string" },
          createdBy: { oneOf: [{ type: "null" }, { type: "string" }] },
          companyId: { type: "string" },
          brandId: { type: "string" },
          outletId: { type: "string" },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        },
        required: ["reason", "companyId", "brandId", "outletId"],
      },
      OrderPagination: {
        type: "object",
        properties: {
          currentPage: { type: "number" },
          totalPages: { type: "number" },
          totalOrders: { type: "number" },
          limit: { type: "number" },
          hasNextPage: { type: "boolean" },
          hasPrevPage: { type: "boolean" },
          nextPage: { oneOf: [{ type: "null" }, { type: "number" }] },
          prevPage: { oneOf: [{ type: "null" }, { type: "number" }] },
        },
        required: ["currentPage", "totalPages", "totalOrders", "limit", "hasNextPage", "hasPrevPage"],
      },
      OrderList: {
        type: "object",
        properties: {
          data: { type: "array", items: { $ref: "#/components/schemas/Order" } },
          pagination: { $ref: "#/components/schemas/OrderPagination" },
        },
        required: ["data", "pagination"],
      },
      Payment: {
        type: "object",
        properties: {
          _id: { type: "string" },
          companyId: { type: "string" },
          companyData: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/Company" }] },
          brandId: { type: "string" },
          brandData: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/Brand" }] },
          outletId: { type: "string" },
          outletData: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/Outlet" }] },
          orderId: { type: "string" },
          discount: {
            type: "object",
            nullable: true,
            properties: {
              discountType: { $ref: "#/components/schemas/DiscountType" },
              discountValue: { type: "number" },
              discountAmount: { type: "number" },
            },
            description: "Null when no discount",
          },
          totalAmount: { type: "number" },
          netAmount: { type: "number" },
          payableAmount: { type: "number" },
          amountPaid: { type: "number" },
          paymentSettlement: {
            allOf: [
              { $ref: "#/components/schemas/PaymentSettlement" },
              {
                type: "object",
                properties: {
                  orderClosedByData: { oneOf: [{ type: "null" }, { $ref: "#/components/schemas/User" }] },
                },
              },
            ],
          },
          isSettled: { type: "boolean" },
          paymentStatus: { $ref: "#/components/schemas/PaymentStatus" },
          orderStatus: { $ref: "#/components/schemas/OrderStatus" },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        },
      },
      ExpenseCategory: {
        type: "object",
        properties: {
          _id: { type: "string" },
          name: { type: "string" },
          companyId: { type: "string" },
          brandId: { type: "string" },
          isActive: { type: "boolean" },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        },
        required: ["name", "companyId", "brandId"],
      },
      Expense: {
        type: "object",
        properties: {
          _id: { type: "string" },
          companyId: { type: "string" },
          outletId: { type: "string" },
          brandId: { type: "string" },
          businessDayId: { type: "string", description: "Automatically assigned to the active business day for the outlet" },
          categoryId: { type: "string" },
          amount: { type: "number" },
          paymentType: { type: "string", enum: ["cash", "card", "upi"], description: "Payment method used" },
          remarks: { type: "string" },
          date: { type: "string", format: "date-time" },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        },
        required: ["companyId", "outletId", "brandId", "businessDayId", "categoryId", "amount", "paymentType"],
      },
      Pagination: {
        type: "object",
        properties: {
          page: { type: "number" },
          limit: { type: "number" },
          total: { type: "number" },
          totalPages: { type: "number" },
          hasNextPage: { type: "boolean" },
          hasPrevPage: { type: "boolean" },
        },
        required: ["page", "limit", "total", "totalPages", "hasNextPage", "hasPrevPage"],
      },
      MenuItem: {
        type: "object",
        properties: {
          _id: { type: "string" },
          companyId: { type: "string" },
          brandId: { type: "string" },
          outletId: { type: "string" },
          categoryId: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          imageURL: { type: "string" },
          price: { type: "number" },
          displayOrder: { type: "number", description: "Display order for sorting items within a category" },
          isActive: { type: "string", enum: ["active", "inactive"] },
          createdBy: { type: "string" },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        },
      },
      MenuItemList: {
        type: "object",
        properties: {
          data: { type: "array", items: { $ref: "#/components/schemas/MenuItem" } },
          pagination: { $ref: "#/components/schemas/Pagination" },
        },
        required: ["data", "pagination"],
      },
      MenuCategory: {
        type: "object",
        properties: {
          _id: { type: "string" },
          companyId: { type: "string" },
          brandId: { type: "string" },
          outletId: { type: "string" },
          name: { type: "string" },
          displayOrder: { type: "number" },
          isActive: { type: "string", enum: ["active", "inactive"] },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        },
      },
      MenuCategoryList: {
        type: "object",
        properties: {
          data: { type: "array", items: { $ref: "#/components/schemas/MenuCategory" } },
          pagination: { $ref: "#/components/schemas/Pagination" },
        },
        required: ["data", "pagination"],
      },
      OrderFieldRequirement: {
        type: "string",
        enum: ["required", "optional", "not-required"],
      },
      OrderType: {
        type: "object",
        properties: {
          _id: { type: "string" },
          companyId: { type: "string" },
          brandId: { type: "string" },
          outletId: { type: "string" },
          type: { type: "string", enum: ["dine-in", "takeaway", "delivery"] },
          tableRequirement: { $ref: "#/components/schemas/OrderFieldRequirement" },
          guestCountRequirement: { $ref: "#/components/schemas/OrderFieldRequirement" },
          customerNameRequirement: { $ref: "#/components/schemas/OrderFieldRequirement" },
          phoneNumberRequirement: { $ref: "#/components/schemas/OrderFieldRequirement" },
          addressRequirement: { $ref: "#/components/schemas/OrderFieldRequirement" },
          isActive: { type: "string", enum: ["active", "inactive"] },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        },
      },
      ApiError: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
      },
      ApiMessage: {
        type: "object",
        properties: { message: { type: "string" } },
      },
      Company: {
        type: "object",
        properties: {
          _id: { type: "string" },
          name: { type: "string" },
          companyCode: { type: "string", description: "Unique code: First 3 letters of name + 4 random digits (e.g., KUB3861)" },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        },
      },
      CompanySummary: {
        type: "object",
        properties: { _id: { type: "string" }, name: { type: "string" } },
        required: ["_id", "name"],
      },
      Brand: {
        type: "object",
        properties: {
          _id: { type: "string" },
          name: { type: "string" },
          status: { type: "string", enum: ["active", "inactive"] },
          companyId: { type: "string" },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        },
      },
      BrandWithCompany: {
        allOf: [
          { $ref: "#/components/schemas/Brand" },
          {
            type: "object",
            properties: {
              company: { $ref: "#/components/schemas/CompanySummary" },
            },
          },
        ],
      },
      BrandList: {
        type: "object",
        properties: {
          data: { type: "array", items: { $ref: "#/components/schemas/BrandWithCompany" } },
          pagination: { $ref: "#/components/schemas/Pagination" },
        },
        required: ["data", "pagination"],
      },
      Outlet: {
        type: "object",
        properties: {
          _id: { type: "string" },
          name: { type: "string" },
          status: { type: "string", enum: ["active", "inactive"] },
          brandId: { type: "string" },
          brandName: { type: "string" },
          companyId: { type: "string" },
          timeZone: {
            type: "string",
            description: "IANA timezone identifier (e.g., 'Asia/Kolkata', 'America/New_York'). Backend stores only IANA format.",
          },
          address: { type: "string", description: "Optional physical address of the outlet" },
          phoneNumber: { type: "string", description: "Optional contact phone number for the outlet" },
          logo: { type: "string", description: "Optional URL for the outlet logo" },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        },
      },
      OutletWithCompany: {
        allOf: [
          { $ref: "#/components/schemas/Outlet" },
          {
            type: "object",
            properties: {
              company: { $ref: "#/components/schemas/CompanySummary" },
            },
          },
        ],
      },
      OutletList: {
        type: "object",
        properties: {
          data: { type: "array", items: { $ref: "#/components/schemas/OutletWithCompany" } },
          pagination: { $ref: "#/components/schemas/Pagination" },
        },
        required: ["data", "pagination"],
      },
      User: {
        type: "object",
        properties: {
          _id: { type: "string" },
          name: { type: "string" },
          username: { type: "string" },
          role: { type: "string" },
        },
      },
      UserPopulated: {
        allOf: [
          { $ref: "#/components/schemas/User" },
          {
            type: "object",
            properties: {
              brandId: { oneOf: [{ type: "string" }, { type: "object" }] },
              outletId: { oneOf: [{ type: "string" }, { type: "object" }] },
              companyId: { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/CompanySummary" }] },
            },
          },
        ],
      },
      Floor: {
        type: "object",
        properties: {
          _id: { type: "string" },
          name: { type: "string" },
          outletId: { type: "string" },
          displayOrder: { type: "number" },
          isActive: { type: "boolean" },
          brandId: { type: "string" },
          companyId: { type: "string" },
        },
      },
      FloorList: {
        type: "object",
        properties: {
          data: { type: "array", items: { $ref: "#/components/schemas/Floor" } },
          pagination: {
            type: "object",
            properties: {
              page: { type: "number" },
              limit: { type: "number" },
              total: { type: "number" },
              totalPages: { type: "number" },
              hasNextPage: { type: "boolean" },
              hasPrevPage: { type: "boolean" },
            },
          },
        },
        required: ["data", "pagination"],
      },
      Table: {
        type: "object",
        properties: {
          _id: { type: "string" },
          name: { type: "string" },
          seatCapacity: { type: "number" },
          displayOrder: { type: "number" },
          isActive: { type: "boolean" },
          isOccupied: {
            type: "boolean",
            default: false,
            description: "Dynamically calculated based on open orders - true if table has an open dine-in order",
          },
          status: {
            type: "string",
            enum: ["available", "busy"],
            description: "Table status: 'busy' if occupied by an open order, 'available' otherwise",
          },
          floorId: { type: "string" },
          companyId: { type: "string" },
          brandId: { type: "string" },
          outletId: { type: "string" },
        },
      },
      TableList: {
        type: "object",
        properties: {
          data: { type: "array", items: { $ref: "#/components/schemas/Table" } },
          pagination: {
            type: "object",
            properties: {
              page: { type: "number" },
              limit: { type: "number" },
              total: { type: "number" },
              totalPages: { type: "number" },
              hasNextPage: { type: "boolean" },
              hasPrevPage: { type: "boolean" },
            },
          },
        },
        required: ["data", "pagination"],
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

const paths: any = {
  "/orders": {
    get: {
      summary: "List orders by outlet (paginated)",
      description: "Role-based visibility: waiter sees only their own taken orders; cashier/admin see all.",
      tags: ["Orders"],
      parameters: [
        { name: "outletId", in: "query", required: true, schema: { type: "string" }, description: "Outlet ID to filter orders" },
        {
          name: "businessDayId",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "Business day ID to filter orders",
        },
        {
          name: "search",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "Search by order number, customer name, table name/number, or order taken by",
        },
        {
          name: "status",
          in: "query",
          required: false,
          schema: { $ref: "#/components/schemas/OrderStatus" },
          description: "Order status filter",
        },
        {
          name: "paymentStatus",
          in: "query",
          required: false,
          schema: { $ref: "#/components/schemas/PaymentStatus" },
          description: "Payment status filter",
        },
        { name: "isKot", in: "query", required: false, schema: { type: "boolean" }, description: "Filter by KOT status" },
        { name: "isReceipt", in: "query", required: false, schema: { type: "boolean" }, description: "Filter by receipt status" },
        {
          name: "orderType",
          in: "query",
          required: false,
          schema: { type: "string" },
          description:
            "Filter by order type name (dine-in, takeaway, delivery). Supports comma-separated values for multiple types. Cannot be used with orderTypeId.",
        },
        {
          name: "orderTypeId",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "Filter by order type ID. Supports comma-separated IDs for multiple types. Cannot be used with orderType.",
        },
        { name: "page", in: "query", required: false, schema: { type: "number" }, description: "Page number (default: 1)" },
        { name: "limit", in: "query", required: false, schema: { type: "number" }, description: "Items per page (default: 10, max: 100)" },
      ],
      responses: {
        200: {
          description: "OK",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OrderList" },
            },
          },
        },
      },
    },
    post: {
      summary: "Create order",
      tags: ["Orders"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                outletId: { type: "string" },
                orderTypeId: { type: "string" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    description: "Minimal item input. Price/name derived from DB.",
                    properties: { itemId: { type: "string" }, quantity: { type: "number" }, note: { type: "string" } },
                    required: ["itemId", "quantity"],
                  },
                },
                note: { type: "string" },
                isKot: { type: "boolean", default: false },
                discount: {
                  type: "object",
                  nullable: true,
                  properties: {
                    discountType: { $ref: "#/components/schemas/DiscountType" },
                    discountValue: { type: "number", minimum: 0 },
                  },
                  required: ["discountType", "discountValue"],
                  description: "Optional discount. discountAmount is computed by backend.",
                },
                deliveryCharges: { type: "number", minimum: 0, description: "Delivery charges applied at order level" },
                dineIn: {
                  type: "object",
                  nullable: true,
                  properties: {
                    tableName: { type: "string" },
                    tableId: { type: "string" },
                    guestCount: { type: "number", minimum: 0 },
                  },
                  description:
                    "Dine-in info. Backend ensures keys exist per order type; requiredness temporarily disabled (keys default to null).",
                },
                delivery: {
                  type: "object",
                  nullable: true,
                  properties: {
                    customerName: { type: "string" },
                    phone: { type: "string" },
                    address: { type: "string" },
                  },
                  description:
                    "Delivery info. Backend ensures keys exist per order type; requiredness temporarily disabled (keys default to null).",
                },
                paymentSettlement: { $ref: "#/components/schemas/PaymentInput" },
              },
              required: ["outletId", "orderTypeId", "items"],
            },
          },
        },
      },
      responses: { 200: { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } } } },
    },
  },
  "/business-days": {
    get: {
      summary: "List business days for an outlet",
      tags: ["Business Days"],
      parameters: [{ name: "outletId", in: "query", required: true, schema: { type: "string" } }],
      responses: {
        200: {
          description: "OK",
          content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/BusinessDay" } } } },
        },
      },
    },
  },
  "/business-days/start": {
    post: {
      summary: "Start a business day",
      tags: ["Business Days"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { outletId: { type: "string" }, startingBalance: { type: "number" } },
              required: ["outletId"],
            },
          },
        },
      },
      responses: {
        200: { description: "Started", content: { "application/json": { schema: { $ref: "#/components/schemas/BusinessDay" } } } },
      },
    },
  },
  "/business-days/current": {
    get: {
      summary: "Get current open business day for an outlet",
      description:
        "Returns the currently open business day with real-time aggregated totals. Includes: opening balance, totalSales (gross sales), totalDiscounts, deliveryCharge, totalCash, totalCard, totalUpi, totalPayments (cash+card+upi), totalExpense, netSales (sum of all order netAmounts = totalPayments), and netTotal (netSales - expenses). All financial data is calculated dynamically from settled orders and expenses.",
      tags: ["Business Days"],
      parameters: [{ name: "outletId", in: "query", required: true, schema: { type: "string" } }],
      responses: {
        200: {
          description: "Open day with real-time calculations",
          content: { "application/json": { schema: { $ref: "#/components/schemas/BusinessDay" } } },
        },
        404: { description: "No open day" },
      },
    },
  },
  "/business-days/data": {
    get: {
      summary: "Get business day data with flexible date filtering",
      tags: ["Business Days"],
      description:
        "Flexible endpoint to retrieve business day data. Returns current business day by default, business day at a specific date if only startDate is provided, or multiple business days if both startDate and endDate are provided.",
      parameters: [
        {
          name: "outletId",
          in: "query",
          required: true,
          schema: { type: "string" },
          description: "Outlet ID to get business day data for",
        },
        {
          name: "startDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date" },
          description:
            "Start date (YYYY-MM-DD). If provided alone, returns business day active at this date. If provided with endDate, returns business days in range.",
        },
        {
          name: "endDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date" },
          description: "End date (YYYY-MM-DD). Must be used with startDate to get multiple business days in date range.",
        },
      ],
      responses: {
        200: {
          description:
            "Business day data retrieved successfully. Returns single object if no dates or only startDate provided, array if both dates provided.",
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  { $ref: "#/components/schemas/BusinessDay" },
                  { type: "array", items: { $ref: "#/components/schemas/BusinessDay" } },
                ],
              },
            },
          },
        },
        404: { description: "No business day found for the specified criteria" },
        400: { description: "Invalid parameters or date format" },
      },
    },
  },
  "/business-days/close": {
    post: {
      summary: "Close business day (only if all orders closed)",
      description:
        "Closes the business day and finalizes all calculations. Aggregates data from all settled orders and expenses: totalSales (gross sales), totalDiscounts, deliveryCharge, totalCash, totalCard, totalUpi, totalPayments, netSales (sum of all order netAmounts), totalExpense, and netTotal (netSales - expenses). The netSales equals the sum of all payments and also equals totalSales - discounts + deliveryCharge. Requires all orders to be closed before day can be closed.",
      tags: ["Business Days"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { businessDayId: { type: "string" }, closingBalance: { type: "number" }, remarks: { type: "string" } },
              required: ["businessDayId"],
            },
          },
        },
      },
      responses: {
        200: {
          description: "Closed with finalized calculations",
          content: { "application/json": { schema: { $ref: "#/components/schemas/BusinessDay" } } },
        },
        400: { description: "Open orders exist - cannot close day" },
      },
    },
  },
  "/orders/{orderId}": {
    get: {
      summary: "Get order by id",
      tags: ["Orders"],
      parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } } },
        404: { description: "Not found" },
      },
    },
    put: {
      summary: "Update order (editable unless cancelled or closed)",
      tags: ["Orders"],
      parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    description: "Minimal item input. Price/name derived from DB.",
                    properties: {
                      itemId: { type: "string" },
                      quantity: { type: "number" },
                      note: { type: "string" },
                      isVoid: { type: "boolean", description: "Mark item as voided/cancelled" },
                    },
                    required: ["itemId", "quantity"],
                  },
                },
                note: { type: "string" },
                isKot: { type: "boolean", description: "Mark KOT as printed", default: false },
                isReceipt: { type: "boolean", description: "Mark receipt as printed" },
                status: { $ref: "#/components/schemas/OrderStatus", description: "Update order status (open/closed/cancelled)" },
                orderTypeId: { type: "string" },
                discount: {
                  type: "object",
                  nullable: true,
                  properties: {
                    discountType: { $ref: "#/components/schemas/DiscountType" },
                    discountValue: { type: "number", minimum: 0 },
                  },
                  required: ["discountType", "discountValue"],
                  description: "Discount to apply to the order. Backend computes discountAmount. Set to null to remove discount.",
                },
                deliveryCharges: { type: "number", minimum: 0, description: "Delivery charges applied at order level" },
                dineIn: {
                  type: "object",
                  nullable: true,
                  properties: {
                    tableName: { type: "string" },
                    tableId: { type: "string" },
                    guestCount: { type: "number", minimum: 0 },
                  },
                  description: "Dine-in specific information. Set to null to clear.",
                },
                delivery: {
                  type: "object",
                  nullable: true,
                  properties: {
                    customerName: { type: "string" },
                    phone: { type: "string" },
                    address: { type: "string" },
                  },
                  description: "Delivery specific information. Set to null to clear.",
                },
                paymentSettlement: { $ref: "#/components/schemas/PaymentInput" },
              },
              description: "All fields are optional. Only provided fields will be updated. Payment cannot exceed net amount.",
            },
          },
        },
      },
      responses: {
        200: {
          description: "Updated (order may auto-close if payment becomes settled)",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } },
        },
        400: { description: "Locked order, validation error, or payment exceeds net amount" },
        404: { description: "Order not found" },
      },
    },
  },
  "/orders/{orderId}/cancel": {
    put: {
      summary: "Cancel an order",
      tags: ["Orders"],
      description: "Cancel an order. Cannot cancel already cancelled orders.",
      parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string", description: "Order ID to cancel" } }],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                reasonId: { type: "string", description: "Optional cancel reason id (ref: CancelReason)" },
                remark: { type: "string", description: "Optional remark explaining the cancellation" },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Order cancelled successfully",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } },
        },
        400: { description: "Order is already cancelled" },
        404: { description: "Order not found" },
      },
    },
  },

  "/cancel-reasons": {
    get: {
      summary: "List cancel reasons",
      tags: ["Orders"],
      parameters: [
        {
          name: "outletId",
          in: "query",
          required: true,
          schema: { type: "string" },
          description: "Required. Non-admins: inferred from user; Admin: must provide or have it on user",
        },
      ],
      responses: {
        200: {
          description: "OK",
          content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/CancelReason" } } } },
        },
      },
    },
    post: {
      summary: "Create cancel reason",
      tags: ["Orders"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                reason: { type: "string" },
                outletId: {
                  type: "string",
                  description: "Required. Non-admins: inferred from user; Admin: must provide or have it on user",
                },
              },
              required: ["reason", "outletId"],
            },
          },
        },
      },
      responses: {
        200: { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/CancelReason" } } } },
      },
    },
  },
  "/cancel-reasons/{id}": {
    delete: {
      summary: "Delete cancel reason (only if unused)",
      tags: ["Orders"],
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
        {
          name: "outletId",
          in: "query",
          required: true,
          schema: { type: "string" },
          description: "Required. Non-admins: inferred from user; Admin: must provide or have it on user",
        },
      ],
      responses: {
        200: { description: "Deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiMessage" } } } },
        400: { description: "Reason used by an order" },
        404: { description: "Reason not found" },
      },
    },
  },
  "/orders/{orderId}/close": {
    put: {
      summary: "Close an order",
      tags: ["Orders"],
      description: "Close an order. Cannot close cancelled or already closed orders.",
      parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string", description: "Order ID to close" } }],
      responses: {
        200: {
          description: "Order closed successfully",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } },
        },
        400: { description: "Order is cancelled or already closed" },
        404: { description: "Order not found" },
      },
    },
  },

  "/expense/categories": {
    get: {
      summary: "List expense categories",
      tags: ["Expenses"],
      parameters: [{ name: "brandId", in: "query", required: false, schema: { type: "string" } }],
      responses: {
        200: {
          description: "OK",
          content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/ExpenseCategory" } } } },
        },
      },
    },
    post: {
      summary: "Create expense category",
      tags: ["Expenses"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { name: { type: "string" }, brandId: { type: "string" } },
              required: ["name", "brandId"],
            },
          },
        },
      },
      responses: {
        200: { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/ExpenseCategory" } } } },
      },
      security: [{ BearerAuth: [] }],
    },
  },
  "/expense/categories/{id}": {
    put: {
      summary: "Update expense category",
      tags: ["Expenses"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", properties: { name: { type: "string" }, isActive: { type: "boolean" } } },
          },
        },
      },
      responses: {
        200: { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/ExpenseCategory" } } } },
      },
      security: [{ BearerAuth: [] }],
    },
    delete: {
      summary: "Delete expense category",
      tags: ["Expenses"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Deleted" }, 404: { description: "Not found" } },
      security: [{ BearerAuth: [] }],
    },
  },
  "/expenses": {
    get: {
      summary: "List expenses with total",
      tags: ["Expenses"],
      parameters: [
        { name: "outletId", in: "query", required: true, schema: { type: "string" } },
        { name: "categoryId", in: "query", required: false, schema: { type: "string" } },
        { name: "from", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        { name: "to", in: "query", required: false, schema: { type: "string", format: "date-time" } },
      ],
      description:
        "Lists all expenses for an outlet filtered by optional date range. All expenses are linked to business days via businessDayId. If no from/to are provided, defaults to current day (00:00:00-23:59:59 UTC).",
      responses: {
        200: {
          description: "OK",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: { type: "array", items: { $ref: "#/components/schemas/Expense" } },
                  totalExpenseAmount: { type: "number" },
                },
                required: ["data", "totalExpenseAmount"],
              },
            },
          },
        },
      },
    },
    post: {
      summary: "Create expense",
      tags: ["Expenses"],
      description:
        "Creates a new expense under the currently active business day for the outlet. The businessDayId is automatically assigned from the active (open) business day. An error will be thrown if no active business day exists for the outlet.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                outletId: { type: "string", description: "The outlet where the expense occurred (required)" },
                categoryId: { type: "string", description: "The expense category ID (required)" },
                amount: { type: "number", description: "Amount of the expense (required, must be >= 0)" },
                paymentType: { type: "string", enum: ["cash", "card", "upi"], description: "Payment method used (required)" },
                remarks: { type: "string", description: "Optional notes or description for the expense" },
                date: {
                  type: "string",
                  format: "date-time",
                  description: "Date and time of the expense (optional, defaults to current time)",
                },
              },
              required: ["outletId", "categoryId", "amount", "paymentType"],
            },
          },
        },
      },
      responses: {
        200: { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Expense" } } } },
        400: { description: "Missing required fields, invalid outlet/category, or no active business day found" },
      },
      security: [{ BearerAuth: [] }],
    },
  },

  "/expenses/{id}": {
    get: {
      summary: "Get expense by id",
      tags: ["Expenses"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Expense" } } } },
        404: { description: "Not found" },
      },
    },
    put: {
      summary: "Update expense",
      tags: ["Expenses"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                outletId: { type: "string" },
                categoryId: { type: "string" },
                amount: { type: "number" },
                paymentType: { type: "string", enum: ["cash", "card", "upi"], description: "Payment method used" },
                remarks: { type: "string" },
                date: { type: "string", format: "date-time" },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/Expense" } } } },
        404: { description: "Not found" },
      },
      security: [{ BearerAuth: [] }],
    },
    delete: {
      summary: "Delete expense",
      tags: ["Expenses"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Deleted" }, 404: { description: "Not found" } },
      security: [{ BearerAuth: [] }],
    },
  },
  "/order-types": {
    get: {
      summary: "Get order types for brand/outlet (auto-create defaults)",
      tags: ["Order Types"],
      parameters: [{ name: "outletId", in: "query", required: true, schema: { type: "string" } }],
      responses: {
        200: {
          description: "Order types",
          content: {
            "application/json": {
              schema: { type: "object", properties: { orderTypes: { type: "array", items: { $ref: "#/components/schemas/OrderType" } } } },
            },
          },
        },
        400: { description: "User must have a company or invalid/missing outletId" },
        404: { description: "Outlet not found in your company" },
      },
    },
  },
  "/menu/categories": {
    get: {
      summary: "List menu categories by outlet",
      tags: ["Menu Categories"],
      parameters: [
        { name: "outletId", in: "query", required: true, schema: { type: "string" } },
        { name: "isActive", in: "query", required: false, schema: { type: "string", enum: ["active", "inactive"] } },
        { name: "page", in: "query", required: false, schema: { type: "number" } },
        { name: "limit", in: "query", required: false, schema: { type: "number" } },
        { name: "allowAllResponse", in: "query", required: false, schema: { type: "boolean" } },
      ],
      responses: {
        200: {
          description: "Categories",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MenuCategoryList" },
            },
          },
        },
        400: { description: "User must have a company or invalid/missing outletId" },
        404: { description: "Outlet not found in your company" },
      },
    },
    post: {
      summary: "Create menu category (admin and cashier)",
      tags: ["Menu Categories"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                displayOrder: { type: "number" },
                isActive: { type: "string", enum: ["active", "inactive"] },
                outletId: { type: "string" },
              },
              required: ["name", "outletId"],
            },
          },
        },
      },
      responses: {
        200: {
          description: "Created",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { message: { type: "string" }, category: { $ref: "#/components/schemas/MenuCategory" } },
              },
            },
          },
        },
        400: { description: "Validation error or user must have a company" },
        403: { description: "Only admin and cashier users can create categories" },
      },
    },
  },
  "/menu/categories/{id}": {
    put: {
      summary: "Update menu category (admin and cashier)",
      tags: ["Menu Categories"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                displayOrder: { type: "number" },
                isActive: { type: "string", enum: ["active", "inactive"] },
                outletId: { type: "string" },
              },
              required: ["outletId"],
            },
          },
        },
      },
      responses: {
        200: {
          description: "Updated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { message: { type: "string" }, category: { $ref: "#/components/schemas/MenuCategory" } },
              },
            },
          },
        },
        400: { description: "Validation error or user must have a company" },
        403: { description: "Only admin and cashier users can update categories" },
        404: { description: "Category not found" },
      },
    },
    get: {
      summary: "Get menu category by id",
      tags: ["Menu Categories"],
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
        { name: "outletId", in: "query", required: true, schema: { type: "string" } },
      ],
      responses: {
        200: {
          description: "Category",
          content: {
            "application/json": { schema: { type: "object", properties: { category: { $ref: "#/components/schemas/MenuCategory" } } } },
          },
        },
        400: { description: "User must have a company or invalid/missing outletId" },
        404: { description: "Category not found" },
      },
    },
    delete: {
      summary: "Delete menu category (admin and cashier)",
      tags: ["Menu Categories"],
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
        { name: "outletId", in: "query", required: true, schema: { type: "string" } },
      ],
      parametersInherit: true,
      responses: {
        200: { description: "Deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiMessage" } } } },
        400: { description: "Validation error or user must have a company" },
        403: { description: "Only admin and cashier users can delete categories" },
        404: { description: "Category not found" },
      },
    },
  },
  "/menu/items": {
    get: {
      summary: "List menu items by outlet (optional category/isActive filters)",
      tags: ["Menu Items"],
      parameters: [
        { name: "outletId", in: "query", required: true, schema: { type: "string" } },
        { name: "categoryId", in: "query", required: false, schema: { type: "string" } },
        { name: "isActive", in: "query", required: false, schema: { type: "string", enum: ["active", "inactive"] } },
        { name: "page", in: "query", required: false, schema: { type: "number" } },
        { name: "limit", in: "query", required: false, schema: { type: "number" } },
        { name: "allowAllResponse", in: "query", required: false, schema: { type: "boolean" } },
      ],
      responses: {
        200: {
          description: "Items",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MenuItemList" },
            },
          },
        },
        400: { description: "User must have a company or invalid/missing outletId or invalid filters" },
        404: { description: "Outlet not found in your company" },
      },
    },
    post: {
      summary: "Create menu item (admin and cashier)",
      tags: ["Menu Items"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                outletId: { type: "string" },
                categoryId: { type: "string" },
                name: { type: "string" },
                description: { type: "string" },
                imageURL: { type: "string" },
                price: { type: "number" },
                displayOrder: { type: "number", description: "Display order for sorting items within a category (default: 0)" },
                isActive: { type: "string", enum: ["active", "inactive"] },
              },
              required: ["outletId", "categoryId", "name", "price"],
            },
          },
        },
      },
      responses: {
        200: {
          description: "Created",
          content: {
            "application/json": {
              schema: { type: "object", properties: { message: { type: "string" }, item: { $ref: "#/components/schemas/MenuItem" } } },
            },
          },
        },
        400: { description: "Validation error or user must have a company" },
        403: { description: "Only admin and cashier users can create menu items" },
        404: { description: "Category not found in this outlet" },
      },
    },
  },
  "/menu/items/{id}": {
    put: {
      summary: "Update menu item (admin and cashier)",
      tags: ["Menu Items"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                outletId: { type: "string" },
                categoryId: { type: "string" },
                name: { type: "string" },
                description: { type: "string" },
                imageURL: { type: "string" },
                price: { type: "number" },
                displayOrder: { type: "number", description: "Display order for sorting items within a category" },
                isActive: { type: "string", enum: ["active", "inactive"] },
              },
              required: ["outletId"],
            },
          },
        },
      },
      responses: {
        200: {
          description: "Updated",
          content: {
            "application/json": {
              schema: { type: "object", properties: { message: { type: "string" }, item: { $ref: "#/components/schemas/MenuItem" } } },
            },
          },
        },
        400: { description: "Validation error or user must have a company" },
        403: { description: "Only admin and cashier users can update menu items" },
        404: { description: "Menu item or category not found" },
      },
    },
    get: {
      summary: "Get menu item by id",
      tags: ["Menu Items"],
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
        { name: "outletId", in: "query", required: true, schema: { type: "string" } },
      ],
      responses: {
        200: {
          description: "Item",
          content: { "application/json": { schema: { type: "object", properties: { item: { $ref: "#/components/schemas/MenuItem" } } } } },
        },
        400: { description: "User must have a company or invalid/missing outletId" },
        404: { description: "Menu item not found" },
      },
    },
    delete: {
      summary: "Delete menu item (admin and cashier)",
      tags: ["Menu Items"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "Deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiMessage" } } } },
        400: { description: "Validation error or user must have a company" },
        403: { description: "Only admin and cashier users can delete menu items" },
        404: { description: "Menu item not found" },
      },
    },
  },
  "/order-types/{type}": {
    put: {
      summary: "Update order type for brand/outlet (admin)",
      tags: ["Order Types"],
      parameters: [{ name: "type", in: "path", required: true, schema: { type: "string", enum: ["dine-in", "takeaway", "delivery"] } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              oneOf: [
                {
                  type: "object",
                  properties: {
                    outletId: { type: "string" },
                    tableRequirement: { $ref: "#/components/schemas/OrderFieldRequirement" },
                    guestCountRequirement: { $ref: "#/components/schemas/OrderFieldRequirement" },
                    isActive: { type: "string", enum: ["active", "inactive"] },
                  },
                  required: ["outletId", "tableRequirement", "guestCountRequirement", "isActive"],
                },
                {
                  type: "object",
                  properties: {
                    outletId: { type: "string" },
                    isActive: { type: "string", enum: ["active", "inactive"] },
                  },
                  required: ["outletId", "isActive"],
                },
                {
                  type: "object",
                  properties: {
                    outletId: { type: "string" },
                    customerNameRequirement: { $ref: "#/components/schemas/OrderFieldRequirement" },
                    phoneNumberRequirement: { $ref: "#/components/schemas/OrderFieldRequirement" },
                    addressRequirement: { $ref: "#/components/schemas/OrderFieldRequirement" },
                    isActive: { type: "string", enum: ["active", "inactive"] },
                  },
                  required: ["outletId", "customerNameRequirement", "phoneNumberRequirement", "addressRequirement", "isActive"],
                },
              ],
            },
          },
        },
      },
      responses: {
        200: {
          description: "Updated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { message: { type: "string" }, orderType: { $ref: "#/components/schemas/OrderType" } },
              },
            },
          },
        },
        400: { description: "User must have a company, invalid type/outlet id, or missing required fields" },
        403: { description: "Only admin users can update order types" },
        404: { description: "Outlet not found in your company" },
      },
    },
  },
  "/auth/signin": {
    post: {
      summary: "Sign in",
      tags: ["Auth"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                username: { type: "string", description: "Username (alphanumeric, lowercase, no spaces)" },
                password: { type: "string" },
                companyCode: { type: "string", pattern: "^[0-9]{4}$", description: "4-digit company code" },
              },
              required: ["username", "password", "companyCode"],
            },
          },
        },
      },
      responses: {
        200: {
          description: "Authenticated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  jwtToken: { type: "string" },
                  user: { $ref: "#/components/schemas/UserPopulated" },
                },
              },
            },
          },
        },
        400: {
          description: "Missing credentials, invalid credentials, or invalid company code format",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
        },
        404: {
          description: "User not found in this company or company not found",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
        },
      },
      security: [],
    },
  },
  "/auth/logout": {
    post: {
      summary: "Logout",
      tags: ["Auth"],
      responses: {
        200: { description: "Logged out", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiMessage" } } } },
        400: { description: "Token not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
      },
    },
  },

  "/users/addAdminUser": {
    post: {
      summary: "Create an admin user and company (dev-only)",
      description: "Temporary development route to bootstrap an admin and a company.",
      tags: ["Users"],
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                username: { type: "string" },
                password: { type: "string" },
                companyName: { type: "string" },
              },
              required: ["username", "password", "companyName"],
            },
          },
        },
      },
      responses: {
        200: {
          description: "Admin user and company created",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  user: {
                    type: "object",
                    properties: {
                      _id: { type: "string" },
                      username: { type: "string" },
                      role: { type: "string", enum: ["admin", "waiter", "cashier"] },
                      companyId: { oneOf: [{ type: "null" }, { type: "string" }] },
                    },
                  },
                  company: {
                    type: "object",
                    properties: {
                      _id: { type: "string" },
                      name: { type: "string" },
                      companyCode: { type: "string" },
                      createdAt: { type: "string" },
                      updatedAt: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "Invalid request" },
      },
    },
  },

  "/users": {
    get: {
      summary: "List users",
      tags: ["Users"],
      parameters: [
        { name: "role", in: "query", required: false, schema: { type: "string" } },
        { name: "page", in: "query", required: false, schema: { type: "number" } },
        { name: "limit", in: "query", required: false, schema: { type: "number" } },
        { name: "allowAllResponse", in: "query", required: false, schema: { type: "boolean" } },
      ],
      responses: {
        200: {
          description: "Users list",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: { type: "array", items: { $ref: "#/components/schemas/UserPopulated" } },
                  pagination: { $ref: "#/components/schemas/Pagination" },
                },
                required: ["data", "pagination"],
              },
            },
          },
        },
        403: { description: "Unauthorized access", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
      },
    },
    post: {
      summary: "Create user (admin)",
      tags: ["Users"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                username: {
                  type: "string",
                  description: "Username (alphanumeric, lowercase, no spaces, 3-20 chars, unique within company)",
                },
                password: { type: "string" },
                role: { type: "string", enum: ["admin", "waiter", "cashier"] },
                outletId: { type: "string", description: "Required when role is waiter/cashier" },
              },
              required: ["username", "password", "role"],
            },
          },
        },
      },
      responses: {
        200: { description: "User created", content: { "application/json": { schema: { $ref: "#/components/schemas/UserPopulated" } } } },
        400: {
          description:
            "Validation error (invalid role, duplicate username within company, invalid username format, missing outletId or inactive/invalid outlet/brand)",
        },
        403: { description: "Only admin can create users" },
      },
    },
  },
  "/users/{userId}": {
    get: {
      summary: "Get user by id",
      tags: ["Users"],
      parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "User", content: { "application/json": { schema: { $ref: "#/components/schemas/UserPopulated" } } } },
        403: { description: "Unauthorized access" },
      },
    },
    put: {
      summary: "Update user",
      tags: ["Users"],
      parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object" },
          },
        },
      },
      responses: {
        200: { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/UserPopulated" } } } },
        400: { description: "Validation error or user not found" },
        403: { description: "Unauthorized or cannot update admin user" },
      },
    },
    delete: {
      summary: "Delete user (admin)",
      tags: ["Users"],
      parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "Deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } },
        403: { description: "Only admin can delete users or cannot delete admin user" },
        404: { description: "User not found" },
      },
    },
  },

  "/company": {
    get: {
      summary: "Get company",
      tags: ["Company"],
      responses: {
        200: {
          description: "Company or auto-created company",
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  { type: "object", properties: { company: { $ref: "#/components/schemas/Company" } } },
                  { type: "object", properties: { message: { type: "string" }, company: { $ref: "#/components/schemas/Company" } } },
                ],
              },
            },
          },
        },
        403: { description: "User must be admin to auto-create company" },
      },
    },
    post: {
      summary: "Create company (admin)",
      tags: ["Company"],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } },
      },
      responses: {
        200: {
          description: "Created",
          content: {
            "application/json": {
              schema: { type: "object", properties: { message: { type: "string" }, company: { $ref: "#/components/schemas/Company" } } },
            },
          },
        },
        400: { description: "Company name is required or user already has a company" },
        403: { description: "Only admin users can create companies" },
      },
    },
    put: {
      summary: "Update company (admin)",
      tags: ["Company"],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } },
      },
      responses: {
        200: {
          description: "Updated",
          content: {
            "application/json": {
              schema: { type: "object", properties: { message: { type: "string" }, company: { $ref: "#/components/schemas/Company" } } },
            },
          },
        },
        400: { description: "Company name is required" },
        403: { description: "Only admin users can update companies" },
      },
    },
  },

  "/brands": {
    get: {
      summary: "List brands",
      description: "Admin sees all brands. Non-admins see only active brands.",
      tags: ["Brands"],
      parameters: [
        { name: "page", in: "query", required: false, schema: { type: "number" } },
        { name: "limit", in: "query", required: false, schema: { type: "number" } },
        { name: "allowAllResponse", in: "query", required: false, schema: { type: "boolean" } },
      ],
      responses: {
        200: {
          description: "Brands list",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BrandList" },
            },
          },
        },
        400: { description: "User must have a company" },
        403: { description: "Unauthorized access" },
      },
    },
    post: {
      summary: "Create brand (admin)",
      tags: ["Brands"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                status: { type: "string", enum: ["active", "inactive"] },
              },
              required: ["name"],
            },
          },
        },
      },
      responses: {
        200: {
          description: "Created",
          content: {
            "application/json": {
              schema: { type: "object", properties: { message: { type: "string" }, brand: { $ref: "#/components/schemas/Brand" } } },
            },
          },
        },
        400: { description: "Name required or user must have a company" },
        403: { description: "Only admin users can create brands" },
        404: { description: "Company not found" },
      },
    },
  },
  "/brands/{id}": {
    get: {
      summary: "Get brand by id",
      description: "Non-admins receive 404 for inactive brands.",
      tags: ["Brands"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: {
          description: "Brand",
          content: {
            "application/json": { schema: { type: "object", properties: { brand: { $ref: "#/components/schemas/BrandWithCompany" } } } },
          },
        },
        400: { description: "Invalid brand ID or user must have a company" },
        403: { description: "Unauthorized access" },
        404: { description: "Brand not found" },
      },
    },
    put: {
      summary: "Update brand (admin)",
      tags: ["Brands"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                status: { type: "string", enum: ["active", "inactive"] },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Updated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { message: { type: "string" }, brand: { $ref: "#/components/schemas/BrandWithCompany" } },
              },
            },
          },
        },
        400: { description: "Invalid brand ID or user must have a company" },
        403: { description: "Only admin users can update brands" },
        404: { description: "Brand not found" },
      },
    },
    delete: {
      summary: "Delete brand (admin)",
      tags: ["Brands"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "Deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiMessage" } } } },
        400: { description: "Invalid brand ID or user must have a company" },
        403: { description: "Only admin users can delete brands" },
        404: { description: "Brand not found" },
      },
    },
  },

  "/outlets": {
    get: {
      summary: "List outlets",
      description: "Admin sees all outlets. Non-admins see only active outlets under active brands. Optional filter by brandId.",
      tags: ["Outlets"],
      parameters: [
        { name: "brandId", in: "query", required: false, schema: { type: "string" }, description: "Filter outlets by brand id" },
        { name: "page", in: "query", required: false, schema: { type: "number" } },
        { name: "limit", in: "query", required: false, schema: { type: "number" } },
        { name: "allowAllResponse", in: "query", required: false, schema: { type: "boolean" } },
      ],
      responses: {
        200: {
          description: "Outlets list",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OutletList" },
            },
          },
        },
        400: { description: "User must have a company or invalid brandId filter" },
        403: { description: "Unauthorized access" },
      },
    },
    post: {
      summary: "Create outlet (admin)",
      tags: ["Outlets"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                status: { type: "string", enum: ["active", "inactive"] },
                brandId: { type: "string" },
                timeZone: {
                  type: "string",
                  description:
                    "Timezone in any of these formats: IANA format (e.g., 'Asia/Kolkata', 'America/New_York'), offset format (e.g., 'IST +05:30', '+05:30', 'EST -05:00'), or just offset ('-05:00'). Backend automatically converts to IANA format for storage.",
                },
                address: { type: "string", description: "Optional physical address of the outlet" },
                phoneNumber: { type: "string", description: "Optional contact phone number for the outlet" },
                logo: { type: "string", description: "Optional URL for the outlet logo" },
                fromOutletId: {
                  type: "string",
                  nullable: true,
                  description: "Optional. Copy categories and menu items from this outlet into the new outlet.",
                },
              },
              required: ["name", "brandId", "timeZone"],
            },
          },
        },
      },
      responses: {
        200: {
          description: "Created",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { message: { type: "string" }, outlet: { $ref: "#/components/schemas/OutletWithCompany" } },
              },
            },
          },
        },
        400: {
          description: "Name/brandId/timeZone required, invalid brandId, cannot create under inactive brand, or user must have a company",
        },
        403: { description: "Only admin users can create outlets" },
        404: { description: "Brand not found or doesn't belong to your company" },
      },
    },
  },
  "/outlets/import-menu": {
    post: {
      summary: "Import menu categories and items from another outlet",
      tags: ["Outlets"],
      description:
        "Copies all categories and their menu items from a source outlet to a target outlet within the same company. The imported items are ADDED to the target outlet's existing menu without deleting or replacing any existing categories or menu items. This allows you to merge menus from multiple outlets.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                outletId: { type: "string", description: "Target outlet ID (destination)" },
                fromOutletId: { type: "string", description: "Source outlet ID to copy from" },
                brandId: { type: "string", description: "Brand ID for the target outlet (used on created records)" },
                forceImport: {
                  type: "boolean",
                  description: "DEPRECATED: This parameter is ignored. Import always adds items without deleting existing ones.",
                  default: false,
                },
                page: { type: "number", description: "Page number for response pagination" },
                limit: { type: "number", description: "Items per page for response pagination" },
                allowAllResponse: { type: "boolean", description: "If true, returns all without pagination" },
              },
              required: ["outletId", "fromOutletId", "brandId"],
            },
          },
        },
      },
      responses: {
        200: {
          description: "Import complete (or existing data returned)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "array",
                    items: {
                      allOf: [
                        { $ref: "#/components/schemas/MenuCategory" },
                        {
                          type: "object",
                          properties: {
                            menuItems: { type: "array", items: { $ref: "#/components/schemas/MenuItem" } },
                          },
                        },
                      ],
                    },
                  },
                  pagination: { $ref: "#/components/schemas/Pagination" },
                  message: { type: "string", description: "Description of action taken" },
                  imported: { type: "boolean", description: "True if data was imported, false if existing data was returned" },
                  importSummary: {
                    type: "object",
                    description: "Summary of import operation (only present when imported=true)",
                    properties: {
                      categoriesImported: { type: "number", description: "Number of categories imported in this operation" },
                      menuItemsImported: { type: "number", description: "Number of menu items imported in this operation" },
                      existingCategoriesBefore: { type: "number", description: "Number of categories that existed before import" },
                      existingMenuItemsBefore: { type: "number", description: "Number of menu items that existed before import" },
                      totalCategoriesNow: { type: "number", description: "Total number of categories after import" },
                      totalMenuItemsNow: { type: "number", description: "Total number of menu items after import" },
                      sourceOutletId: { type: "string", description: "ID of the outlet data was copied from" },
                      targetOutletId: { type: "string", description: "ID of the outlet data was copied to" },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "Validation error (missing/invalid IDs or no company)" },
        404: { description: "Target/source outlet or brand not found, or source outlet has no categories to copy" },
      },
    },
  },
  "/outlets/{id}": {
    get: {
      summary: "Get outlet by id",
      description: "Non-admins receive 404 for inactive outlets or outlets under inactive brands.",
      tags: ["Outlets"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: {
          description: "Outlet",
          content: {
            "application/json": { schema: { type: "object", properties: { outlet: { $ref: "#/components/schemas/OutletWithCompany" } } } },
          },
        },
        400: { description: "Invalid outlet ID or user must have a company" },
        403: { description: "Unauthorized access" },
        404: { description: "Outlet not found" },
      },
    },
    put: {
      summary: "Update outlet (admin)",
      tags: ["Outlets"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                status: { type: "string", enum: ["active", "inactive"] },
                brandId: { type: "string" },
                timeZone: {
                  type: "string",
                  description:
                    "Timezone in any of these formats: IANA format (e.g., 'Asia/Kolkata', 'America/New_York'), offset format (e.g., 'IST +05:30', '+05:30', 'EST -05:00'), or just offset ('-05:00'). Backend automatically converts to IANA format for storage.",
                },
                address: { type: "string", description: "Optional physical address of the outlet" },
                phoneNumber: { type: "string", description: "Optional contact phone number for the outlet" },
                logo: { type: "string", description: "Optional URL for the outlet logo" },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Updated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { message: { type: "string" }, outlet: { $ref: "#/components/schemas/OutletWithCompany" } },
              },
            },
          },
        },
        400: { description: "Invalid outlet/brand ID, user must have a company, or cannot move under inactive brand" },
        403: { description: "Only admin users can update outlets" },
        404: { description: "Outlet not found or brand not found" },
      },
    },
    delete: {
      summary: "Delete outlet (admin)",
      tags: ["Outlets"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "Deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiMessage" } } } },
        400: { description: "Invalid outlet ID or user must have a company" },
        403: { description: "Only admin users can delete outlets" },
        404: { description: "Outlet not found" },
      },
    },
  },
  "/floors": {
    get: {
      summary: "List floors by outlet",
      tags: ["Floors"],
      parameters: [
        { name: "outletId", in: "query", required: true, schema: { type: "string" } },
        { name: "isActive", in: "query", required: false, schema: { type: "string", enum: ["active", "inactive"] } },
        { name: "page", in: "query", required: false, schema: { type: "number" } },
        { name: "limit", in: "query", required: false, schema: { type: "number" } },
        { name: "allowAllResponse", in: "query", required: false, schema: { type: "boolean" } },
      ],
      responses: {
        200: { description: "Floors", content: { "application/json": { schema: { $ref: "#/components/schemas/FloorList" } } } },
        400: { description: "Outlet ID required/invalid or user must have a company" },
        404: { description: "Outlet not found in your company" },
      },
    },
    post: {
      summary: "Create floor (admin and cashier)",
      tags: ["Floors"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                outletId: { type: "string" },
                displayOrder: { type: "number" },
                isActive: { type: "boolean" },
              },
              required: ["name", "outletId"],
            },
          },
        },
      },
      responses: {
        200: { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Floor" } } } },
        400: { description: "Validation error or user must have a company" },
        403: { description: "Only admin and cashier users can create floors" },
      },
    },
  },
  "/floors/{floorId}": {
    put: {
      summary: "Update floor (admin and cashier)",
      tags: ["Floors"],
      parameters: [{ name: "floorId", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { type: "object", properties: { name: { type: "string" }, isActive: { type: "boolean" } } } },
        },
      },
      responses: {
        200: { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/Floor" } } } },
        400: { description: "Validation error or user must have a company" },
        403: { description: "Only admin and cashier users can update floors" },
        404: { description: "Floor not found" },
      },
    },
    delete: {
      summary: "Delete floor (admin and cashier)",
      tags: ["Floors"],
      parameters: [{ name: "floorId", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "Deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiMessage" } } } },
        400: { description: "Validation error or user must have a company" },
        403: { description: "Only admin and cashier users can delete floors" },
        404: { description: "Floor not found" },
      },
    },
  },
  "/tables": {
    get: {
      summary: "List tables (optional by floor)",
      description:
        "Returns tables with dynamically calculated isOccupied and status fields based on open dine-in orders. Status is 'busy' if table has an open order, 'available' otherwise.",
      tags: ["Tables"],
      parameters: [
        { name: "floorId", in: "query", required: false, schema: { type: "string" } },
        { name: "outletId", in: "query", required: false, schema: { type: "string" } },
        { name: "isActive", in: "query", required: false, schema: { type: "string", enum: ["active", "inactive"] } },
        { name: "isOccupied", in: "query", required: false, schema: { type: "boolean" } },
        { name: "page", in: "query", required: false, schema: { type: "number" } },
        { name: "limit", in: "query", required: false, schema: { type: "number" } },
        { name: "allowAllResponse", in: "query", required: false, schema: { type: "boolean" } },
      ],
      responses: {
        200: {
          description: "Tables with dynamic occupancy status",
          content: { "application/json": { schema: { $ref: "#/components/schemas/TableList" } } },
        },
        400: { description: "User must have a company or invalid floorId" },
      },
    },
    post: {
      summary: "Create table (admin and cashier)",
      tags: ["Tables"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                floorId: { type: "string" },
                seatCapacity: { type: "number" },
                displayOrder: { type: "number" },
                isActive: { type: "boolean" },
                isOccupied: { type: "boolean" },
              },
              required: ["name", "floorId", "seatCapacity", "displayOrder"],
            },
          },
        },
      },
      responses: {
        200: { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Table" } } } },
        400: { description: "Validation error or user must have a company" },
        403: { description: "Only admin and cashier users can create tables" },
      },
    },
  },
  "/tables/{tableId}": {
    put: {
      summary: "Update table (admin and cashier)",
      tags: ["Tables"],
      parameters: [{ name: "tableId", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                seatCapacity: { type: "number" },
                displayOrder: { type: "number" },
                isActive: { type: "boolean" },
                isOccupied: { type: "boolean" },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/Table" } } } },
        400: { description: "Validation error or user must have a company" },
        403: { description: "Only admin and cashier users can update tables" },
        404: { description: "Table not found" },
      },
    },
    delete: {
      summary: "Delete table (admin and cashier)",
      tags: ["Tables"],
      parameters: [{ name: "tableId", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "Deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiMessage" } } } },
        400: { description: "User must have a company" },
        403: { description: "Only admin and cashier users can delete tables" },
        404: { description: "Table not found" },
      },
    },
  },
  "/uploads/upload-url": {
    get: {
      summary: "Get S3 signed upload URL",
      tags: ["Uploads"],
      parameters: [
        { name: "filename", in: "query", required: true, schema: { type: "string" } },
        { name: "contentType", in: "query", required: true, schema: { type: "string" } },
        { name: "prefix", in: "query", required: false, schema: { type: "string" }, description: "Optional key prefix e.g. images/" },
      ],
      responses: {
        200: {
          description: "Signed upload URL",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  uploadLink: { type: "string" },
                  fileLink: { type: "string" },
                  key: { type: "string" },
                },
                required: ["uploadLink", "fileLink", "key"],
              },
            },
          },
        },
        400: { description: "Missing filename/contentType or user must have a company" },
      },
    },
  },
  "/sales/report": {
    get: {
      summary: "Get sales report (dashboard analytics)",
      description:
        "Role-based visibility: waiter analytics include only their taken orders; cashier/admin see all. All dates are handled in UTC timezone. Defaults to current business day if active, otherwise today's date. You may also pass a date range. Table status: 'busy' indicates tables with open dine-in orders (occupied), 'available' indicates tables without open orders.",
      tags: ["Sales"],
      parameters: [
        { name: "outletId", in: "query", required: true, schema: { type: "string" }, description: "Outlet ID to generate report for" },
        {
          name: "fromDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
          description:
            "Start date in ISO 8601 format. Can be date only (YYYY-MM-DD) for start of day in UTC, or include time (YYYY-MM-DDTHH:mm:ssZ) for specific time in UTC. If omitted, uses current business day if active, else today.",
        },
        {
          name: "toDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
          description:
            "End date in ISO 8601 format. Can be date only (YYYY-MM-DD) for end of day in UTC, or include time (YYYY-MM-DDTHH:mm:ssZ) for specific time in UTC. If omitted with fromDate, uses the same day.",
        },
      ],
      responses: {
        200: {
          description: "Sales report generated successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  salesToday: {
                    type: "object",
                    properties: {
                      totalSales: { type: "number", example: 100 },
                      orders: { type: "number", example: 55 },
                    },
                  },
                  orders: {
                    type: "object",
                    properties: {
                      pending: { type: "number", example: 28 },
                      closed: { type: "number", example: 33 },
                      cancelled: { type: "number", example: 9 },
                    },
                  },
                  activeTables: {
                    type: "object",
                    description: "Table occupancy statistics based on open dine-in orders",
                    properties: {
                      busy: { type: "number", example: 9, description: "Number of tables with open dine-in orders (occupied)" },
                      available: { type: "number", example: 7, description: "Number of tables without open orders (not occupied)" },
                      total: { type: "number", example: 16, description: "Total number of active tables in the outlet" },
                    },
                  },
                  employees: {
                    type: "object",
                    properties: {
                      currentlyWorking: { type: "number", example: 6 },
                      totalEmployees: { type: "number", example: 10 },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "Missing required parameters or user must have a company" },
        404: { description: "Outlet not found" },
      },
    },
  },
  "/sales/report/item-report": {
    get: {
      summary: "Get item sales report",
      description:
        "Role-based visibility: waiter sees items only from their taken orders; cashier/admin see all. All dates are handled in UTC timezone. Defaults to current business day if active, otherwise today's date.",
      tags: ["Sales"],
      parameters: [
        { name: "outletId", in: "query", required: true, schema: { type: "string" }, description: "Outlet ID to generate report for" },
        {
          name: "fromDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
          description:
            "Start date in ISO 8601 format. Can be date only (YYYY-MM-DD) for start of day in UTC, or include time (YYYY-MM-DDTHH:mm:ssZ) for specific time in UTC. Defaults to today if not provided.",
        },
        {
          name: "toDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
          description:
            "End date in ISO 8601 format. Can be date only (YYYY-MM-DD) for end of day in UTC, or include time (YYYY-MM-DDTHH:mm:ssZ) for specific time in UTC. Defaults to today if not provided.",
        },
        { name: "page", in: "query", required: false, schema: { type: "number", default: 1 }, description: "Page number (default: 1)" },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "number", default: 10, maximum: 100 },
          description: "Items per page (default: 10, max: 100)",
        },
      ],
      responses: {
        200: {
          description: "Item sales report generated successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        item: { type: "string", example: "salad" },
                        qty: { type: "number", example: 12 },
                        sales: { type: "number", example: 1020 },
                      },
                    },
                  },
                  totalItemSales: {
                    type: "object",
                    properties: {
                      totalQty: { type: "number", example: 12 },
                      totalSales: { type: "number", example: 12312 },
                    },
                  },
                  pagination: {
                    type: "object",
                    properties: {
                      currentPage: { type: "number", example: 1 },
                      totalPages: { type: "number", example: 5 },
                      totalItems: { type: "number", example: 50 },
                      itemsPerPage: { type: "number", example: 10 },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "Missing required parameters, invalid pagination, or user must have a company" },
        404: { description: "Outlet not found" },
      },
    },
  },
  "/sales/report/top-selling-items": {
    get: {
      summary: "Get top selling items report",
      description: "Returns items sorted by quantity sold in descending order. Role-based visibility applied.",
      tags: ["Sales"],
      parameters: [
        { name: "outletId", in: "query", required: true, schema: { type: "string" }, description: "Outlet ID to generate report for" },
        { name: "fromDate", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        { name: "toDate", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        { name: "page", in: "query", required: false, schema: { type: "number", default: 1 } },
        { name: "limit", in: "query", required: false, schema: { type: "number", default: 10 } },
      ],
      responses: {
        200: {
          description: "Top selling items report generated successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        item: { type: "string" },
                        qty: { type: "number" },
                        sales: { type: "number" },
                      },
                    },
                  },
                  pagination: {
                    type: "object",
                    properties: {
                      currentPage: { type: "number" },
                      totalPages: { type: "number" },
                      totalItems: { type: "number" },
                      itemsPerPage: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "/sales/report/category-report": {
    get: {
      summary: "Get category sales report",
      description:
        "Role-based visibility: waiter sees categories only from their taken orders; cashier/admin see all. All dates are handled in UTC timezone. Defaults to current business day if active, otherwise today's date.",
      tags: ["Sales"],
      parameters: [
        { name: "outletId", in: "query", required: true, schema: { type: "string" }, description: "Outlet ID to generate report for" },
        {
          name: "fromDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
          description:
            "Start date in ISO 8601 format. Can be date only (YYYY-MM-DD) for start of day in UTC, or include time (YYYY-MM-DDTHH:mm:ssZ) for specific time in UTC. Defaults to today if not provided.",
        },
        {
          name: "toDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
          description:
            "End date in ISO 8601 format. Can be date only (YYYY-MM-DD) for end of day in UTC, or include time (YYYY-MM-DDTHH:mm:ssZ) for specific time in UTC. Defaults to today if not provided.",
        },
        { name: "page", in: "query", required: false, schema: { type: "number", default: 1 }, description: "Page number (default: 1)" },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "number", default: 10, maximum: 100 },
          description: "Items per page (default: 10, max: 100)",
        },
      ],
      responses: {
        200: {
          description: "Category sales report generated successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        categoryName: { type: "string", example: "Beverages" },
                        qty: { type: "number", example: 12 },
                        sales: { type: "number", example: 1200 },
                      },
                    },
                  },
                  totalCategorySales: {
                    type: "object",
                    properties: {
                      totalQty: { type: "number", example: 12 },
                      totalSales: { type: "number", example: 12312 },
                    },
                  },
                  pagination: {
                    type: "object",
                    properties: {
                      currentPage: { type: "number", example: 1 },
                      totalPages: { type: "number", example: 5 },
                      totalItems: { type: "number", example: 50 },
                      itemsPerPage: { type: "number", example: 10 },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "Missing required parameters, invalid pagination, or user must have a company" },
        404: { description: "Outlet not found" },
      },
    },
  },
  "/sales/report/expense-report": {
    get: {
      summary: "Get expense report with timezone-aware date range and category filters",
      description:
        "Generates an expense report for the specified outlet with timezone-aware business day matching. The report uses the outlet's configured timezone (e.g., 'Asia/Kolkata') to accurately match business days to the requested dates. When fromDate equals toDate, it treats it as a single date query. Returns paginated expense data with category information, total amounts, and date range details.",
      tags: ["Sales"],
      parameters: [
        { name: "outletId", in: "query", required: true, schema: { type: "string" }, description: "Outlet ID to generate report for" },
        {
          name: "fromDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date" },
          description:
            "Start date for report (YYYY-MM-DD). When equals toDate, treated as single date query. Uses outlet timezone for business day matching.",
        },
        {
          name: "toDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date" },
          description:
            "End date for report (YYYY-MM-DD). When equals fromDate, treated as single date query. Uses outlet timezone for business day matching.",
        },
        {
          name: "categoryId",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "Optional expense category ID to filter expenses by category",
        },
        { name: "page", in: "query", required: false, schema: { type: "number", default: 1 }, description: "Page number (default: 1)" },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "number", default: 10, maximum: 100 },
          description: "Items per page (default: 10, max: 100)",
        },
      ],
      responses: {
        200: {
          description: "Expense report generated successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        sNo: { type: "number", example: 1 },
                        paymentCategory: { type: "string", example: "Petrol" },
                        date: { type: "string", example: "03 May 2025 11:47 AM" },
                        remarks: { type: "string", example: "to buy chicken" },
                        amount: { type: "number", example: 120 },
                      },
                    },
                  },
                  totalExpenses: {
                    type: "object",
                    properties: {
                      count: { type: "number", example: 25 },
                      totalAmount: { type: "number", example: 5000 },
                    },
                  },
                  dateRange: {
                    type: "object",
                    properties: {
                      from: { type: "string", format: "date", example: "2025-05-01" },
                      to: { type: "string", format: "date", example: "2025-05-31" },
                    },
                  },
                  pagination: {
                    type: "object",
                    properties: {
                      currentPage: { type: "number", example: 1 },
                      totalPages: { type: "number", example: 5 },
                      totalItems: { type: "number", example: 50 },
                      itemsPerPage: { type: "number", example: 10 },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "Missing required parameters, invalid date range, invalid pagination, or user must have a company" },
        404: { description: "Outlet not found" },
      },
    },
  },
  "/sales/report/sales-margin-report": {
    get: {
      summary: "Get sales margin report (sales, expenses, and profit by date)",
      description:
        "Returns daily sales, expenses, and profit margins with timezone-aware business day matching. The report uses the outlet's configured timezone (e.g., 'Asia/Kolkata') to accurately match business days to the requested dates. When fromDate equals toDate, it treats it as a single date query. Role-based visibility: waiter sales figures include only their taken orders; cashier/admin see all.",
      tags: ["Sales"],
      parameters: [
        { name: "outletId", in: "query", required: true, schema: { type: "string" }, description: "Outlet ID to generate report for" },
        {
          name: "fromDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date" },
          description:
            "Start date for report (YYYY-MM-DD). When equals toDate, treated as single date query. Uses outlet timezone for business day matching.",
        },
        {
          name: "toDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date" },
          description:
            "End date for report (YYYY-MM-DD). When equals fromDate, treated as single date query. Uses outlet timezone for business day matching.",
        },
        { name: "page", in: "query", required: false, schema: { type: "number", default: 1 }, description: "Page number (default: 1)" },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "number", default: 10, maximum: 100 },
          description: "Items per page (default: 10, max: 100)",
        },
      ],
      responses: {
        200: {
          description: "Sales margin report generated successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        date: { type: "string", example: "03 May 2025" },
                        sales: { type: "number", example: 10000 },
                        expenses: { type: "number", example: 3000 },
                        profit: { type: "number", example: 7000 },
                      },
                    },
                  },
                  summary: {
                    type: "object",
                    properties: {
                      totalSales: { type: "number", example: 150000 },
                      totalExpenses: { type: "number", example: 45000 },
                      totalProfit: { type: "number", example: 105000 },
                      profitMargin: { type: "number", example: 70, description: "Profit margin percentage" },
                    },
                  },
                  dateRange: {
                    type: "object",
                    properties: {
                      from: { type: "string", format: "date", example: "2025-05-01" },
                      to: { type: "string", format: "date", example: "2025-05-31" },
                    },
                  },
                  pagination: {
                    type: "object",
                    properties: {
                      currentPage: { type: "number", example: 1 },
                      totalPages: { type: "number", example: 5 },
                      totalItems: { type: "number", example: 50 },
                      itemsPerPage: { type: "number", example: 10 },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "Missing required parameters, invalid date range, invalid pagination, or user must have a company" },
        404: { description: "Outlet not found" },
      },
    },
  },
  "/sales/daily-sales-report": {
    get: {
      summary: "Get comprehensive daily sales report",
      tags: ["Sales"],
      description:
        "Generates a comprehensive sales report. All hourly data is extracted in the outlet's configured timezone (e.g., 'Asia/Kolkata' from outlet.timeZone field). If no dates are provided, uses the current business day. If dates are provided, uses the specified date range and attempts to match business days within that range. Role-based visibility: waiter sees reports based only on their taken orders; cashier/admin see all.",
      parameters: [
        { name: "outletId", in: "query", required: true, schema: { type: "string" }, description: "Outlet ID to generate report for" },
        {
          name: "fromDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
          description:
            "Start date in ISO 8601 format. Can be date only (YYYY-MM-DD) for start of day in UTC, or include time (YYYY-MM-DDTHH:mm:ssZ) for specific time in UTC. If not provided, uses current business day or today.",
        },
        {
          name: "toDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
          description:
            "End date in ISO 8601 format. Can be date only (YYYY-MM-DD) for end of day in UTC, or include time (YYYY-MM-DDTHH:mm:ssZ) for specific time in UTC. If not provided, uses current business day or today.",
        },
      ],
      responses: {
        200: {
          description: "Daily sales report generated successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  businessDayId: {
                    type: "string",
                    nullable: true,
                    description: "Business day ID if report is based on a business day, null if based on date range",
                  },
                  dateRange: {
                    type: "object",
                    properties: {
                      startDate: { type: "string", format: "date-time", description: "Start date/time of the report period" },
                      endDate: { type: "string", format: "date-time", description: "End date/time of the report period" },
                    },
                  },
                  category: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            categoryName: { type: "string", example: "Beverages" },
                            qty: { type: "number", example: 12 },
                            sales: { type: "number", example: 1200 },
                          },
                        },
                      },
                      totalCategorySales: {
                        type: "object",
                        properties: {
                          totalQty: { type: "number", example: 12 },
                          totalSales: { type: "number", example: 1200 },
                        },
                      },
                    },
                  },
                  salesByItem: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            item: { type: "string", example: "salad" },
                            qty: { type: "number", example: 12 },
                            sales: { type: "number", example: 1020 },
                          },
                        },
                      },
                      totalItemSales: {
                        type: "object",
                        properties: {
                          totalQty: { type: "number", example: 12 },
                          totalSales: { type: "number", example: 12312 },
                        },
                      },
                    },
                  },
                  salesByOrderType: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            orderType: { type: "string", example: "Dine-In" },
                            qty: { type: "number", example: 12 },
                            sales: { type: "number", example: 1200 },
                          },
                        },
                      },
                      totalSales: {
                        type: "object",
                        properties: {
                          totalQty: { type: "number", example: 12 },
                          totalSales: { type: "number", example: 12312 },
                        },
                      },
                    },
                  },
                  salesByPaymentType: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            type: { type: "string", example: "cash", enum: ["cash", "upi", "card"] },
                            transactions: { type: "number", example: 12 },
                            sales: { type: "number", example: 1200 },
                          },
                        },
                      },
                      totalSales: {
                        type: "object",
                        properties: {
                          totalTransactions: { type: "number", example: 25 },
                          totalSales: { type: "number", example: 12312 },
                        },
                      },
                    },
                  },
                  hourlySales: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            hour: { type: "string", example: "7-8", description: "2-hour interval (0-2, 2-4, ... 22-24)" },
                            transactions: { type: "number", example: 12 },
                            sales: { type: "number", example: 1200 },
                          },
                        },
                      },
                      totalSales: {
                        type: "object",
                        properties: {
                          totalTransactions: { type: "number", example: 50 },
                          totalSales: { type: "number", example: 12312 },
                        },
                      },
                    },
                  },
                  voidType: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            type: { type: "string", example: "itemVoid", enum: ["itemVoid", "orderVoid"] },
                            count: { type: "number", example: 12 },
                            total: { type: "number", example: 1200 },
                          },
                        },
                      },
                      totalVoids: {
                        type: "object",
                        properties: {
                          totalCount: { type: "number", example: 15 },
                          totalAmount: { type: "number", example: 1500 },
                        },
                      },
                    },
                  },
                  waiterSales: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string", example: "John" },
                            total: { type: "number", example: 1200 },
                          },
                        },
                      },
                      totalSales: {
                        type: "object",
                        properties: {
                          totalSales: { type: "number", example: 12312 },
                        },
                      },
                    },
                  },
                  bankingInfo: {
                    type: "object",
                    description:
                      "Banking information summary. Sequence: totalSales (before delivery charges), deliveryCharge (from orders), grossSales (totalSales + deliveryCharge), discounts (applied discounts), netSales (final amount after discounts), expense (total expenses for the business day), netTotal (final profit/loss = netSales - expense)",
                    properties: {
                      totalSales: { type: "number", description: "Total sales before delivery charges", example: 10000.0 },
                      remarks: { type: "string", nullable: true, description: "Business day remarks if available" },
                      data: {
                        type: "array",
                        description: "Detailed breakdown of banking calculations",
                        items: {
                          type: "object",
                          properties: {
                            type: {
                              type: "string",
                              example: "totalSales",
                              enum: ["totalSales", "deliveryCharge", "grossSales", "discounts", "netSales", "expense", "netTotal"],
                              description:
                                "Type of banking line item. 'expense' = total expenses for the business day. 'netTotal' = netSales - expense (final profit/loss)",
                            },
                            total: { type: "number", example: 1200, description: "Amount for this line item" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "Missing required parameters or user must have a company" },
        404: { description: "Outlet not found" },
      },
    },
  },
  "/sales/hourly-sales-data": {
    get: {
      summary: "Get hourly sales data for admin dashboard graphs",
      tags: ["Sales"],
      description:
        "Returns sales data grouped by hourly intervals using timezone-aware business day matching. Supports flexible time intervals (1-24 hours). All hours are extracted in the outlet's timezone (configured in outlet.timeZone field, e.g., 'Asia/Kolkata'). When fromDate equals toDate, it treats it as a single date query. The intervals start from the hour specified in fromDate (in the outlet's timezone) and generate 24 hours of data. For 1-hour intervals, returns hours like '00:00', '01:00', etc. For multi-hour intervals, returns ranges like '00:00-02:00', '02:00-04:00', etc. If no dates provided, uses current business day. Role-based visibility: waiter sees data based only on their taken orders; cashier/admin see all.",
      parameters: [
        { name: "outletId", in: "query", required: true, schema: { type: "string" }, description: "Outlet ID to generate report for" },
        {
          name: "fromDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
          description:
            "Start date in YYYY-MM-DD format. When equals toDate, treated as single date query. Uses outlet timezone for business day matching. If not provided, uses current business day.",
        },
        {
          name: "toDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
          description:
            "End date in YYYY-MM-DD format. When equals fromDate, treated as single date query. Uses outlet timezone for business day matching. If not provided, uses current business day.",
        },
        {
          name: "interval",
          in: "query",
          required: false,
          schema: { type: "number", default: 1, minimum: 1, maximum: 24 },
          description: "Hour interval for grouping (1-24). Default is 1 hour.",
        },
      ],
      responses: {
        200: {
          description: "Hourly sales data retrieved successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        interval: {
                          type: "string",
                          example: "09:00",
                          description: "For 1-hour intervals: '09:00'. For multi-hour intervals: '08:00-10:00'",
                        },
                        transactions: { type: "number", example: 15 },
                        sales: { type: "number", example: 2500.5 },
                        grossSales: { type: "number", example: 2700.0 },
                        discounts: { type: "number", example: 199.5 },
                        averageOrderValue: { type: "number", example: 166.7 },
                      },
                    },
                  },
                  summary: {
                    type: "object",
                    properties: {
                      totalTransactions: { type: "number", example: 120 },
                      totalSales: { type: "number", example: 18500.0 },
                      totalGrossSales: { type: "number", example: 20000.0 },
                      totalDiscounts: { type: "number", example: 1500.0 },
                      averageOrderValue: { type: "number", example: 154.17 },
                      peakHour: {
                        type: "object",
                        properties: {
                          interval: { type: "string", example: "12:00" },
                          sales: { type: "number", example: 3200.0 },
                          transactions: { type: "number", example: 22 },
                        },
                      },
                    },
                  },
                  dateRange: {
                    type: "object",
                    properties: {
                      from: { type: "string", format: "date-time" },
                      to: { type: "string", format: "date-time" },
                    },
                  },
                  interval: { type: "string", example: "1 hour" },
                },
              },
            },
          },
        },
        400: { description: "Invalid parameters or user must have a company" },
        404: { description: "Outlet not found" },
      },
    },
  },
  "/sales/report/voided-orders-details": {
    get: {
      summary: "Get cancelled orders summary report",
      description:
        "Returns cancelled orders with order-level summary including all items. Uses business day matching with timezone awareness. The report groups cancelled orders and provides totals for quantities and amounts. Role-based visibility: waiter sees only their own cancelled orders; cashier/admin see all.",
      tags: ["Sales"],
      parameters: [
        { name: "outletId", in: "query", required: true, schema: { type: "string" }, description: "Outlet ID to generate report for" },
        {
          name: "fromDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
          description:
            "Start date in ISO 8601 format. Can be date only (YYYY-MM-DD) for start of day in UTC, or include time (YYYY-MM-DDTHH:mm:ssZ) for specific time in UTC. If not provided, uses current business day or today.",
        },
        {
          name: "toDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
          description:
            "End date in ISO 8601 format. Can be date only (YYYY-MM-DD) for end of day in UTC, or include time (YYYY-MM-DDTHH:mm:ssZ) for specific time in UTC. If not provided, uses current business day or today.",
        },
        { name: "page", in: "query", required: false, schema: { type: "number", default: 1 }, description: "Page number (default: 1)" },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "number", default: 10, maximum: 100 },
          description: "Items per page (default: 10, max: 100)",
        },
      ],
      responses: {
        200: {
          description: "Cancelled orders summary with pagination and totals",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "array",
                    description: "List of cancelled orders",
                    items: {
                      type: "object",
                      properties: {
                        orderNo: { type: "number", example: 145, description: "Order number" },
                        orderType: {
                          type: "string",
                          nullable: true,
                          example: "dine-in",
                          description: "Order type (dine-in, takeaway, delivery)",
                        },
                        orderDate: {
                          type: "string",
                          format: "date-time",
                          example: "2025-01-15T14:30:00.000Z",
                          description: "Order creation date/time",
                        },
                        voidDate: {
                          type: "string",
                          format: "date-time",
                          nullable: true,
                          example: "2025-01-15T15:45:00.000Z",
                          description: "Order cancellation date/time",
                        },
                        voidedBy: { type: "string", nullable: true, example: "Alice", description: "User who cancelled the order" },
                        reason: { type: "string", nullable: true, example: "Customer request", description: "Cancellation reason" },
                        remarks: {
                          type: "string",
                          example: "Customer changed their mind",
                          description: "Cancellation remarks or order note",
                        },
                        items: {
                          type: "array",
                          description: "Array of order items",
                          items: {
                            type: "object",
                            properties: {
                              itemId: { type: "string", description: "Menu item ID" },
                              name: { type: "string", example: "Margherita Pizza", description: "Item name" },
                              quantity: { type: "number", example: 2, description: "Item quantity" },
                              unitPrice: { type: "number", example: 199.0, description: "Item unit price" },
                              totalAmount: { type: "number", example: 398.0, description: "Total amount for this item" },
                              isVoid: { type: "boolean", example: false, description: "Whether this specific item was voided" },
                            },
                          },
                        },
                        totalAmount: { type: "number", example: 850.0, description: "Order total amount (sum of all items)" },
                        netAmount: { type: "number", example: 765.0, description: "Order net amount (after discounts, delivery charges)" },
                      },
                    },
                  },
                  pagination: {
                    type: "object",
                    properties: {
                      currentPage: { type: "number", example: 1 },
                      totalPages: { type: "number", example: 5 },
                      totalItems: { type: "number", example: 45, description: "Total number of cancelled orders" },
                      itemsPerPage: { type: "number", example: 10 },
                    },
                  },
                  dateRange: {
                    type: "object",
                    properties: {
                      timezone: { type: "string", example: "Asia/Kolkata", description: "Outlet timezone used for date matching" },
                    },
                  },
                  totals: {
                    type: "object",
                    nullable: true,
                    description: "Aggregated totals across all cancelled orders in the date range",
                    properties: {
                      totalQty: { type: "number", example: 125, description: "Total quantity of all items across all cancelled orders" },
                      totalAmount: { type: "number", example: 12450.5, description: "Sum of totalAmount from all cancelled orders" },
                      itemsCount: {
                        type: "number",
                        example: 85,
                        description: "Total count of individual line items across all cancelled orders",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "Missing required parameters, invalid date range, or invalid pagination" },
        404: { description: "Outlet not found or no business day data found" },
      },
    },
  },
  "/sales/report/voided-items-details": {
    get: {
      summary: "Get cancelled items summary report",
      description:
        "Returns individual voided/cancelled items from orders (not entire cancelled orders). This report shows items that have been voided within orders, regardless of whether the entire order was cancelled. Uses business day matching with timezone awareness. Role-based visibility: waiter sees only items from their own orders; cashier/admin see all.",
      tags: ["Sales"],
      parameters: [
        { name: "outletId", in: "query", required: true, schema: { type: "string" }, description: "Outlet ID to generate report for" },
        {
          name: "fromDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
          description:
            "Start date in ISO 8601 format. Can be date only (YYYY-MM-DD) for start of day in UTC, or include time (YYYY-MM-DDTHH:mm:ssZ) for specific time in UTC. If not provided, uses current business day or today.",
        },
        {
          name: "toDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
          description:
            "End date in ISO 8601 format. Can be date only (YYYY-MM-DD) for end of day in UTC, or include time (YYYY-MM-DDTHH:mm:ssZ) for specific time in UTC. If not provided, uses current business day or today.",
        },
        { name: "page", in: "query", required: false, schema: { type: "number", default: 1 }, description: "Page number (default: 1)" },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "number", default: 10, maximum: 100 },
          description: "Items per page (default: 10, max: 100)",
        },
      ],
      responses: {
        200: {
          description: "Cancelled items summary with pagination and totals",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "array",
                    description: "List of individual voided items",
                    items: {
                      type: "object",
                      properties: {
                        orderNo: { type: "number", example: 145, description: "Order number containing the voided item" },
                        orderType: {
                          type: "string",
                          nullable: true,
                          example: "dine-in",
                          description: "Order type (dine-in, takeaway, delivery)",
                        },
                        orderDate: {
                          type: "string",
                          format: "date-time",
                          example: "2025-01-15T14:30:00.000Z",
                          description: "Order creation date/time",
                        },
                        voidDate: {
                          type: "string",
                          format: "date-time",
                          nullable: true,
                          example: "2025-01-15T15:45:00.000Z",
                          description: "Item void/cancellation date/time",
                        },
                        voidedBy: { type: "string", nullable: true, example: "Alice", description: "User who cancelled the item/order" },
                        reason: { type: "string", nullable: true, example: "Wrong item ordered", description: "Cancellation reason" },
                        remarks: {
                          type: "string",
                          example: "Customer requested to remove this item",
                          description: "Cancellation remarks or item note",
                        },
                        itemName: { type: "string", example: "Margherita Pizza", description: "Name of the voided item" },
                        unitPrice: { type: "number", example: 199.0, description: "Unit price of the item" },
                        quantity: { type: "number", example: 2, description: "Quantity of the voided item" },
                        totalAmount: {
                          type: "number",
                          example: 398.0,
                          description: "Total amount for this voided item (unitPrice * quantity)",
                        },
                      },
                    },
                  },
                  pagination: {
                    type: "object",
                    properties: {
                      currentPage: { type: "number", example: 1 },
                      totalPages: { type: "number", example: 5 },
                      totalItems: { type: "number", example: 45, description: "Total number of voided items" },
                      itemsPerPage: { type: "number", example: 10 },
                    },
                  },
                  dateRange: {
                    type: "object",
                    properties: {
                      timezone: { type: "string", example: "Asia/Kolkata", description: "Outlet timezone used for date matching" },
                    },
                  },
                  totals: {
                    type: "object",
                    nullable: true,
                    description: "Aggregated totals across all voided items in the date range",
                    properties: {
                      totalQty: { type: "number", example: 125, description: "Total quantity of all voided items" },
                      totalAmount: { type: "number", example: 12450.5, description: "Sum of totalAmount from all voided items" },
                      itemsCount: { type: "number", example: 85, description: "Total count of voided items" },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "Missing required parameters, invalid date range, or invalid pagination" },
        404: { description: "Outlet not found or no business day data found" },
      },
    },
  },
  "/order-history": {
    get: {
      summary: "Get order history with filters and pagination",
      description: "Role-based visibility: waiter sees only their own taken orders; cashier/admin see all.",
      tags: ["Order History"],
      parameters: [
        { name: "outletId", in: "query", required: true, schema: { type: "string" }, description: "Outlet ID to filter orders" },
        {
          name: "fromDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date" },
          description: "Start date for filtering (YYYY-MM-DD)",
        },
        {
          name: "toDate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date" },
          description: "End date for filtering (YYYY-MM-DD)",
        },
        {
          name: "search",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "Search by order number, customer name, table name/number, order taken by, or order type",
        },
        {
          name: "orderType",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "Filter by order type (e.g., 'dine-in', 'takeaway', 'delivery'). Case-insensitive partial match.",
        },
        {
          name: "orderStatus",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["open", "closed", "cancelled"] },
          description: "Filter by order status",
        },
        {
          name: "minAmount",
          in: "query",
          required: false,
          schema: { type: "number", minimum: 0 },
          description: "Minimum order amount (inclusive). Used for amount range filtering.",
        },
        {
          name: "maxAmount",
          in: "query",
          required: false,
          schema: { type: "number", minimum: 0 },
          description: "Maximum order amount (inclusive). Used for amount range filtering.",
        },
        { name: "page", in: "query", required: false, schema: { type: "number", default: 1 }, description: "Page number" },
        { name: "limit", in: "query", required: false, schema: { type: "number", default: 10 }, description: "Items per page (max: 100)" },
      ],
      responses: {
        200: {
          description: "OK",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        sNo: { type: "number", description: "Serial number", example: 1 },
                        orderNo: { type: "number", description: "Order number", example: 1001 },
                        orderType: { type: "string", description: "Order type name", example: "Dine-In" },
                        orderDate: { type: "string", format: "date-time", description: "Order creation date" },
                        businessDate: { type: "string", format: "date-time", description: "Business day date", nullable: true },
                        tableNo: { type: "string", description: "Table number or name", example: "T1" },
                        customer: { type: "string", description: "Customer name", example: "John Doe" },
                        orderBy: { type: "string", description: "Name of user who took the order", example: "Jane Smith" },
                        orderStatus: { type: "string", enum: ["open", "closed", "cancelled"], description: "Order status" },
                        amount: { type: "number", description: "Net amount", example: 1250.5 },
                        orderId: { type: "string", description: "Order ID", example: "64f0b5e2a1c2b3d4e5f6a7b8" },
                        _id: { type: "string", description: "Order ID (alias)", example: "64f0b5e2a1c2b3d4e5f6a7b8" },
                      },
                    },
                  },
                  pagination: {
                    type: "object",
                    properties: {
                      currentPage: { type: "number", example: 1 },
                      totalPages: { type: "number", example: 10 },
                      totalItems: { type: "number", example: 95 },
                      itemsPerPage: { type: "number", example: 10 },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "Invalid parameters or user must have a company" },
        404: { description: "Outlet not found" },
      },
    },
  },
};

const options: swaggerJSDoc.Options = {
  definition: swaggerDefinition,
  apis: [],
};

export const swaggerSpec = { ...swaggerJSDoc(options), paths } as any;
