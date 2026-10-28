// ╔═══════════════════════════════════════════════════════════════╗
// ║  Data Access Layer — Customers                                ║
// ║                                                               ║
// ║  Customer memory and order history queries.                   ║
// ║  Customers are created by WhatsApp interactions, not          ║
// ║  manually — this is read-heavy with light updates.            ║
// ║  Every query is scoped to tenantId.                           ║
// ╚═══════════════════════════════════════════════════════════════╝

import {
  prisma,
  type Prisma,
  type CustomerMemory,
  type Order,
  type OrderItem,
  type Conversation,
  type Message,
} from '@wcos/db';

// ─── Types ────────────────────────────────────────────────────────

export interface CustomerListOptions {
  page?: number;
  limit?: number;
  search?: string;
  isRepeat?: boolean;
  sortBy?: 'newest' | 'oldest' | 'most_spent' | 'most_orders' | 'recent_contact';
}

interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CustomerDetail extends CustomerMemory {
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    total: Prisma.Decimal;
    status: string;
    createdAt: Date;
  }>;
  conversationSummary: {
    totalConversations: number;
    lastConversationDate: Date | null;
    lastStage: string | null;
  };
}

// ─── List Customers ───────────────────────────────────────────────

export async function listCustomers(
  tenantId: string,
  opts: CustomerListOptions = {}
): Promise<PaginatedResult<CustomerMemory>> {
  const page = opts.page || 1;
  const limit = Math.min(opts.limit || 20, 100);
  const skip = (page - 1) * limit;

  const where: Prisma.CustomerMemoryWhereInput = { tenantId };

  if (opts.search) {
    where.OR = [
      { customerName: { contains: opts.search, mode: 'insensitive' } },
      { customerPhone: { contains: opts.search } },
    ];
  }

  if (opts.isRepeat !== undefined) {
    where.isRepeatCustomer = opts.isRepeat;
  }

  let orderBy: Prisma.CustomerMemoryOrderByWithRelationInput;
  switch (opts.sortBy) {
    case 'oldest':
      orderBy = { firstContactAt: 'asc' };
      break;
    case 'most_spent':
      orderBy = { totalSpent: 'desc' };
      break;
    case 'most_orders':
      orderBy = { totalOrders: 'desc' };
      break;
    case 'recent_contact':
      orderBy = { lastContactAt: 'desc' };
      break;
    default:
      orderBy = { lastContactAt: 'desc' };
  }

  const [items, total] = await Promise.all([
    prisma.customerMemory.findMany({
      where,
      skip,
      take: limit,
      orderBy,
    }),
    prisma.customerMemory.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Get Customer Detail ──────────────────────────────────────────

export async function getCustomerDetail(
  tenantId: string,
  customerId: string
): Promise<CustomerDetail | null> {
  const customer = await prisma.customerMemory.findFirst({
    where: {
      id: customerId,
      tenantId, // ← data isolation
    },
  });

  if (!customer) return null;

  // Fetch recent orders for this customer
  const recentOrders = await prisma.order.findMany({
    where: {
      tenantId,
      customerPhone: customer.customerPhone,
    },
    select: {
      id: true,
      orderNumber: true,
      total: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // Fetch conversation summary
  const conversations = await prisma.conversation.findMany({
    where: {
      tenantId,
      customerPhone: customer.customerPhone,
    },
    select: {
      lastMessageAt: true,
      stage: true,
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 1,
  });

  const totalConversations = await prisma.conversation.count({
    where: {
      tenantId,
      customerPhone: customer.customerPhone,
    },
  });

  return {
    ...customer,
    recentOrders,
    conversationSummary: {
      totalConversations,
      lastConversationDate: conversations[0]?.lastMessageAt || null,
      lastStage: conversations[0]?.stage || null,
    },
  };
}

// ─── Update Customer Name ─────────────────────────────────────────

export async function updateCustomerName(
  tenantId: string,
  customerId: string,
  name: string
): Promise<CustomerMemory> {
  const customer = await prisma.customerMemory.findFirst({
    where: { id: customerId, tenantId },
  });

  if (!customer) {
    throw new Error('Customer not found');
  }

  return prisma.customerMemory.update({
    where: { id: customerId },
    data: { customerName: name },
  });
}

// ─── Customer Stats ───────────────────────────────────────────────

export interface CustomerStats {
  totalCustomers: number;
  repeatCustomers: number;
  newThisMonth: number;
  avgOrderValue: number;
  topSpenders: Array<{
    id: string;
    name: string | null;
    phone: string;
    totalSpent: Prisma.Decimal;
    totalOrders: number;
  }>;
}

export async function getCustomerStats(tenantId: string): Promise<CustomerStats> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalCustomers, repeatCustomers, newThisMonth, avgOrderValue, topSpenders] =
    await Promise.all([
      prisma.customerMemory.count({ where: { tenantId } }),
      prisma.customerMemory.count({ where: { tenantId, isRepeatCustomer: true } }),
      prisma.customerMemory.count({
        where: { tenantId, firstContactAt: { gte: monthStart } },
      }),
      prisma.customerMemory.aggregate({
        where: { tenantId, totalOrders: { gt: 0 } },
        _avg: { averageOrderValue: true },
      }),
      prisma.customerMemory.findMany({
        where: { tenantId, totalOrders: { gt: 0 } },
        select: {
          id: true,
          customerName: true,
          customerPhone: true,
          totalSpent: true,
          totalOrders: true,
        },
        orderBy: { totalSpent: 'desc' },
        take: 10,
      }),
    ]);

  return {
    totalCustomers,
    repeatCustomers,
    newThisMonth,
    avgOrderValue: Number(avgOrderValue._avg.averageOrderValue || 0),
    topSpenders: topSpenders.map((s) => ({
      id: s.id,
      name: s.customerName,
      phone: s.customerPhone,
      totalSpent: s.totalSpent,
      totalOrders: s.totalOrders,
    })),
  };
}

// ─── Extended Customer Profile Types ───────────────────────────────

export interface SpendingTimelinePoint {
  date: string;
  orderNumber: string;
  amount: number;
  cumulativeSpend: number;
  status: string;
  itemCount: number;
}

export interface PurchasePowerAnalysis {
  lifetimeValue: number;
  totalOrdersCount: number;
  completedOrdersCount: number;
  cancelledOrdersCount: number;
  averageOrderValue: number;
  highestOrderValue: number;
  tier: 'PLATINUM_VIP' | 'GOLD_PREFERRED' | 'SILVER_REGULAR' | 'PROSPECT';
  tierScore: number; // 0-100
  repeatCadenceDays: number | null;
  preferredPaymentMethod: string | null;
  estimatedMonthlyRunRate: number;
}

export interface CustomerDeliveryAddress {
  name?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  lastUsedAt?: Date;
  ordersCount?: number;
}

export interface CustomerOrderSummary {
  id: string;
  orderNumber: string;
  total: number;
  subtotal: number;
  tax: number;
  discount: number;
  shippingCharge: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  deliveryAddress: CustomerDeliveryAddress | null;
  notes: string | null;
  createdAt: Date;
  items: Array<{
    id: string;
    productName: string;
    productCode: string;
    productImageUrl: string | null;
    quantity: number;
    priceAtOrder: number;
    totalAtOrder: number;
  }>;
}

export interface CustomerChatMessage {
  id: string;
  role: string;
  content: string;
  messageType: string;
  intent: string | null;
  actionTaken: string | null;
  createdAt: Date;
}

export interface FullCustomerProfile {
  id: string;
  customerPhone: string;
  customerName: string | null;
  preferredCategories: string[];
  preferredAttributes: Record<string, any>;
  budgetRange: Record<string, any>;
  preferredLanguage: string;
  isRepeatCustomer: boolean;
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  firstContactAt: Date;
  lastContactAt: Date;
  merchantNotes: string | null;
  merchantTags: string[];
  purchasePower: PurchasePowerAnalysis;
  spendingTimeline: SpendingTimelinePoint[];
  orders: CustomerOrderSummary[];
  deliveryAddresses: CustomerDeliveryAddress[];
  conversation: {
    id: string;
    stage: string;
    language: string;
    lastMessageAt: Date;
    messages: CustomerChatMessage[];
  } | null;
}

// ─── Get Full Customer Profile ─────────────────────────────────────

export async function getFullCustomerProfile(
  tenantId: string,
  phoneOrId: string
): Promise<FullCustomerProfile | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(phoneOrId);
  const cleanPhone = phoneOrId.replace(/[^\d+]/g, '');

  // 1. Fetch CustomerMemory
  let customer = await prisma.customerMemory.findFirst({
    where: {
      tenantId, // ← Multi-tenant isolation
      OR: [
        ...(isUuid ? [{ id: phoneOrId }] : []),
        { customerPhone: phoneOrId },
        { customerPhone: cleanPhone },
        { customerPhone: cleanPhone.replace(/^\+/, '') },
      ],
    },
  });

  const effectivePhone = customer ? customer.customerPhone : phoneOrId;

  // 2. Fetch all orders for this customer (chronological order for timeline)
  const dbOrders = await prisma.order.findMany({
    where: {
      tenantId, // ← Multi-tenant isolation
      customerPhone: effectivePhone,
    },
    include: {
      items: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // 3. Fetch conversation and messages
  const conversation = await prisma.conversation.findFirst({
    where: {
      tenantId, // ← Multi-tenant isolation
      customerPhone: effectivePhone,
    },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 100,
      },
    },
  });

  // If no customer memory and no orders and no conversation, customer doesn't exist
  if (!customer && dbOrders.length === 0 && !conversation) {
    return null;
  }

  // If customer memory row doesn't exist yet, synthesize one so the profile functions smoothly
  if (!customer) {
    const latestOrder = dbOrders[dbOrders.length - 1];
    customer = await prisma.customerMemory.create({
      data: {
        tenantId,
        customerPhone: effectivePhone,
        customerName: latestOrder?.customerName || null,
        preferredLanguage: conversation?.language || 'en',
        firstContactAt: conversation?.startedAt || dbOrders[0]?.createdAt || new Date(),
        lastContactAt: conversation?.lastMessageAt || latestOrder?.createdAt || new Date(),
        totalOrders: dbOrders.length,
        totalSpent: dbOrders.reduce((sum, o) => sum + Number(o.total), 0),
        averageOrderValue: dbOrders.length > 0
          ? dbOrders.reduce((sum, o) => sum + Number(o.total), 0) / dbOrders.length
          : 0,
        isRepeatCustomer: dbOrders.length > 1,
      },
    });
  }

  // 4. Compute Cumulative Spending Timeline & Graph Points
  let runningCumulative = 0;
  const spendingTimeline: SpendingTimelinePoint[] = [];

  for (const o of dbOrders) {
    const orderTotal = Number(o.total);
    // Include completed or active non-cancelled orders in cumulative spend
    const isCancelled = o.status === 'CANCELLED' || o.status === 'REFUNDED';
    if (!isCancelled) {
      runningCumulative += orderTotal;
    }

    spendingTimeline.push({
      date: o.createdAt.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      orderNumber: o.orderNumber,
      amount: orderTotal,
      cumulativeSpend: runningCumulative,
      status: o.status,
      itemCount: o.items.reduce((sum, item) => sum + item.quantity, 0),
    });
  }

  // 5. Compute Purchasing Power Analytics
  const completedOrders = dbOrders.filter(
    (o) => o.status === 'DELIVERED' || o.status === 'SHIPPED' || o.status === 'PAYMENT_CONFIRMED' || o.status === 'PROCESSING'
  );
  const cancelledOrders = dbOrders.filter((o) => o.status === 'CANCELLED' || o.status === 'REFUNDED');

  const lifetimeValue = Number(customer.totalSpent);
  const totalOrdersCount = dbOrders.length;
  const highestOrderValue = dbOrders.length > 0
    ? Math.max(...dbOrders.map((o) => Number(o.total)))
    : 0;

  // Calculate repeat cadence (average days between successive orders)
  let repeatCadenceDays: number | null = null;
  if (dbOrders.length >= 2) {
    const firstDate = new Date(dbOrders[0].createdAt).getTime();
    const lastDate = new Date(dbOrders[dbOrders.length - 1].createdAt).getTime();
    const totalDays = Math.max(1, (lastDate - firstDate) / (1000 * 60 * 60 * 24));
    repeatCadenceDays = Math.round(totalDays / (dbOrders.length - 1));
  }

  // Preferred payment method frequency
  const paymentMethodCounts: Record<string, number> = {};
  for (const o of dbOrders) {
    if (o.paymentMethod) {
      paymentMethodCounts[o.paymentMethod] = (paymentMethodCounts[o.paymentMethod] || 0) + 1;
    }
  }
  let preferredPaymentMethod: string | null = null;
  let maxCount = 0;
  for (const [method, count] of Object.entries(paymentMethodCounts)) {
    if (count > maxCount) {
      maxCount = count;
      preferredPaymentMethod = method;
    }
  }

  // Determine Customer Purchasing Power Tier
  let tier: 'PLATINUM_VIP' | 'GOLD_PREFERRED' | 'SILVER_REGULAR' | 'PROSPECT' = 'PROSPECT';
  let tierScore = 10; // default for prospect

  if (lifetimeValue >= 20000 || totalOrdersCount >= 5) {
    tier = 'PLATINUM_VIP';
    tierScore = Math.min(100, 85 + Math.floor(lifetimeValue / 5000));
  } else if (lifetimeValue >= 5000 || totalOrdersCount >= 2) {
    tier = 'GOLD_PREFERRED';
    tierScore = Math.min(84, 60 + Math.floor(lifetimeValue / 1000));
  } else if (totalOrdersCount >= 1 || lifetimeValue > 0) {
    tier = 'SILVER_REGULAR';
    tierScore = Math.min(59, 30 + Math.floor(lifetimeValue / 200));
  }

  const estimatedMonthlyRunRate = repeatCadenceDays && repeatCadenceDays > 0
    ? Math.round((30 / repeatCadenceDays) * Number(customer.averageOrderValue))
    : Number(customer.averageOrderValue);

  const purchasePower: PurchasePowerAnalysis = {
    lifetimeValue,
    totalOrdersCount,
    completedOrdersCount: completedOrders.length,
    cancelledOrdersCount: cancelledOrders.length,
    averageOrderValue: Number(customer.averageOrderValue),
    highestOrderValue,
    tier,
    tierScore,
    repeatCadenceDays,
    preferredPaymentMethod,
    estimatedMonthlyRunRate,
  };

  // 6. Extract Delivery Addresses and Deduplicate
  const deliveryAddressMap = new Map<string, CustomerDeliveryAddress>();
  for (const o of [...dbOrders].reverse()) {
    if (o.deliveryAddress && typeof o.deliveryAddress === 'object') {
      const addr = o.deliveryAddress as Record<string, any>;
      const key = `${addr.addressLine1 || ''}-${addr.pincode || ''}`.toLowerCase().trim();
      if (key && !deliveryAddressMap.has(key)) {
        deliveryAddressMap.set(key, {
          name: addr.name || addr.fullName || o.customerName || undefined,
          phone: addr.phone || addr.mobileNumber || o.customerPhone || undefined,
          addressLine1: addr.addressLine1 || addr.street || addr.address || undefined,
          addressLine2: addr.addressLine2 || addr.area || undefined,
          landmark: addr.landmark || undefined,
          city: addr.city || undefined,
          state: addr.state || undefined,
          pincode: addr.pincode || addr.postalCode || addr.pin || undefined,
          country: addr.country || 'India',
          lastUsedAt: o.createdAt,
        });
      }
    }
  }

  const deliveryAddresses = Array.from(deliveryAddressMap.values());

  // 7. Format Orders (in reverse chronological order for recent first)
  const orders: CustomerOrderSummary[] = [...dbOrders].reverse().map((o) => {
    let parsedAddress: CustomerDeliveryAddress | null = null;
    if (o.deliveryAddress && typeof o.deliveryAddress === 'object') {
      const addr = o.deliveryAddress as Record<string, any>;
      parsedAddress = {
        name: addr.name || addr.fullName || o.customerName || undefined,
        phone: addr.phone || addr.mobileNumber || undefined,
        addressLine1: addr.addressLine1 || addr.street || addr.address || undefined,
        addressLine2: addr.addressLine2 || addr.area || undefined,
        landmark: addr.landmark || undefined,
        city: addr.city || undefined,
        state: addr.state || undefined,
        pincode: addr.pincode || addr.postalCode || addr.pin || undefined,
        country: addr.country || 'India',
      };
    }

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      total: Number(o.total),
      subtotal: Number(o.subtotal),
      tax: Number(o.tax),
      discount: Number(o.discount),
      shippingCharge: Number(o.shippingCharge),
      currency: o.currency,
      status: o.status,
      paymentMethod: o.paymentMethod,
      trackingNumber: o.trackingNumber,
      trackingUrl: o.trackingUrl,
      deliveryAddress: parsedAddress,
      notes: o.notes,
      createdAt: o.createdAt,
      items: o.items.map((item) => ({
        id: item.id,
        productName: item.productName,
        productCode: item.productCode,
        productImageUrl: item.productImageUrl,
        quantity: item.quantity,
        priceAtOrder: Number(item.priceAtOrder),
        totalAtOrder: Number(item.totalAtOrder),
      })),
    };
  });

  // Extract merchant internal notes and tags from preferredAttributes JSON
  const prefAttrs = (customer.preferredAttributes && typeof customer.preferredAttributes === 'object')
    ? (customer.preferredAttributes as Record<string, any>)
    : {};

  const merchantNotes = typeof prefAttrs.merchantNotes === 'string' ? prefAttrs.merchantNotes : null;
  const merchantTags = Array.isArray(prefAttrs.merchantTags) ? prefAttrs.merchantTags : [];

  return {
    id: customer.id,
    customerPhone: customer.customerPhone,
    customerName: customer.customerName,
    preferredCategories: customer.preferredCategories,
    preferredAttributes: prefAttrs,
    budgetRange: (customer.budgetRange && typeof customer.budgetRange === 'object')
      ? (customer.budgetRange as Record<string, any>)
      : {},
    preferredLanguage: customer.preferredLanguage,
    isRepeatCustomer: customer.isRepeatCustomer,
    totalOrders: customer.totalOrders,
    totalSpent: Number(customer.totalSpent),
    averageOrderValue: Number(customer.averageOrderValue),
    firstContactAt: customer.firstContactAt,
    lastContactAt: customer.lastContactAt,
    merchantNotes,
    merchantTags,
    purchasePower,
    spendingTimeline,
    orders,
    deliveryAddresses,
    conversation: conversation
      ? {
          id: conversation.id,
          stage: conversation.stage,
          language: conversation.language,
          lastMessageAt: conversation.lastMessageAt,
          messages: conversation.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            messageType: m.messageType,
            intent: m.intent,
            actionTaken: m.actionTaken,
            createdAt: m.createdAt,
          })),
        }
      : null,
  };
}

// ─── Update Customer Profile Details ───────────────────────────────

export interface UpdateCustomerInput {
  customerName?: string;
  preferredLanguage?: string;
  preferredCategories?: string[];
  merchantNotes?: string;
  merchantTags?: string[];
  preferredAttributes?: Record<string, unknown>;
  budgetRange?: Record<string, unknown>;
}

export async function updateCustomerDetails(
  tenantId: string,
  customerIdOrPhone: string,
  input: UpdateCustomerInput
): Promise<CustomerMemory> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerIdOrPhone);

  const existing = await prisma.customerMemory.findFirst({
    where: {
      tenantId, // ← Multi-tenant isolation
      OR: [
        ...(isUuid ? [{ id: customerIdOrPhone }] : []),
        { customerPhone: customerIdOrPhone },
      ],
    },
  });

  if (!existing) {
    throw new Error('Customer profile not found');
  }

  // Merge attributes safely
  const currentAttrs = (existing.preferredAttributes && typeof existing.preferredAttributes === 'object')
    ? (existing.preferredAttributes as Record<string, any>)
    : {};

  const updatedAttrs = {
    ...currentAttrs,
    ...(input.preferredAttributes || {}),
  };

  if (input.merchantNotes !== undefined) {
    updatedAttrs.merchantNotes = input.merchantNotes;
  }
  if (input.merchantTags !== undefined) {
    updatedAttrs.merchantTags = input.merchantTags;
  }

  const data: Prisma.CustomerMemoryUpdateInput = {
    preferredAttributes: updatedAttrs as Prisma.InputJsonValue,
  };

  if (input.customerName !== undefined) {
    data.customerName = input.customerName.trim() || null;
  }
  if (input.preferredLanguage !== undefined) {
    data.preferredLanguage = input.preferredLanguage.trim().toLowerCase();
  }
  if (input.preferredCategories !== undefined) {
    data.preferredCategories = input.preferredCategories;
  }
  if (input.budgetRange !== undefined) {
    data.budgetRange = input.budgetRange as Prisma.InputJsonValue;
  }

  const updated = await prisma.customerMemory.update({
    where: { id: existing.id },
    data,
  });

  // If customer name was changed, sync to active conversation or latest order
  if (input.customerName && input.customerName.trim()) {
    try {
      await prisma.order.updateMany({
        where: {
          tenantId,
          customerPhone: existing.customerPhone,
          customerName: null,
        },
        data: { customerName: input.customerName.trim() },
      });
    } catch {
      // Non-blocking sync
    }
  }

  return updated;
}

