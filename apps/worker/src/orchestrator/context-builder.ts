import { prisma } from '@wcos/db';
import { type PromptContext, type ChatMessage } from '@wcos/ai';
import { normalizePaymentUrl } from '@wcos/payments';

export interface CartItemData {
  productId: string;
  productCode: string;
  name: string;
  quantity: number;
  price: number;
  mrp?: number;
  imageUrl?: string;
}

export interface StoredCart {
  items: CartItemData[];
  subtotal: number;
  reservationId?: string;
}

export interface ConversationContextResult {
  tenant: any;
  customerMemory: any;
  conversation: any;
  cart: StoredCart;
  history: ChatMessage[];
  promptContext: PromptContext;
}

/**
 * Builds all context needed for the AI Gateway:
 * - Tenant details and persona
 * - Customer memory profile
 * - Conversation session and previous message history
 * - Active shopping cart with prices and bill calculations
 * - Incomplete / pending order detection
 * - Dynamic catalog matches
 */
export async function buildConversationContext(
  tenantId: string,
  customerPhone: string,
  customerName?: string,
  currentMessageText?: string
): Promise<ConversationContextResult> {
  // 1. Fetch Tenant
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  // 2. Fetch or create CustomerMemory
  let customerMemory = await prisma.customerMemory.findUnique({
    where: {
      tenantId_customerPhone: {
        tenantId,
        customerPhone,
      },
    },
  });

  if (!customerMemory) {
    customerMemory = await prisma.customerMemory.create({
      data: {
        tenantId,
        customerPhone,
        customerName: customerName || null,
        preferredLanguage: 'en',
      },
    });
  } else if (customerName && !customerMemory.customerName) {
    customerMemory = await prisma.customerMemory.update({
      where: { id: customerMemory.id },
      data: { customerName },
    });
  }

  // 3. Fetch or create Conversation session
  const now = new Date();
  const sessionTtl = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24-hour window

  let conversation = await prisma.conversation.findUnique({
    where: {
      tenantId_customerPhone: {
        tenantId,
        customerPhone,
      },
    },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        tenantId,
        customerPhone,
        stage: 'GREETING',
        expiresAt: sessionTtl,
        metadata: {
          cart: { items: [], subtotal: 0 },
        },
      },
    });
  }

  // 4. Fetch recent message history (last 10 messages)
  const recentMessages = await prisma.message.findMany({
    where: {
      conversationId: conversation.id,
    },
    take: 10,
    orderBy: { createdAt: 'desc' },
  });

  // Reverse so they are in chronological order
  const history: ChatMessage[] = recentMessages.reverse().map((m) => ({
    role: m.role === 'customer' ? 'user' : 'assistant',
    content: m.content,
  }));

  // 5. Parse Cart from conversation metadata
  const metadata = (conversation.metadata as Record<string, any>) || {};
  const cart: StoredCart = metadata['cart'] || { items: [], subtotal: 0 };

  // 6. Pre-fetch relevant catalog products if message contains inquiry keywords
  let catalogContext = '';
  if (currentMessageText && currentMessageText.length > 2) {
    const searchTerms = currentMessageText
      .replace(/[^\w\s]/gi, '')
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 3);

    if (searchTerms.length > 0) {
      const matchedProducts = await prisma.product.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          OR: searchTerms.map((term) => ({
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { category: { contains: term, mode: 'insensitive' } },
              { tags: { has: term.toLowerCase() } },
            ],
          })),
        },
        take: 4,
      });

      if (matchedProducts.length > 0) {
        catalogContext = matchedProducts
          .map(
            (p) =>
              `- [Code: ${p.code}] *${p.name}* | Price: ₹${Number(p.salePrice || p.price)} | Stock: ${p.stock > 0 ? `${p.stock} available` : 'OUT OF STOCK'}\n  ${p.description || ''}`
          )
          .join('\n');
      }
    }
  }

  // 7. Check for previous order delivery details & customer memory address
  const lastOrderWithAddress = await prisma.order.findFirst({
    where: {
      tenantId,
      customerPhone,
      deliveryAddress: { not: null as any },
    },
    orderBy: { createdAt: 'desc' },
  });

  const preferredAttrs = (customerMemory.preferredAttributes as Record<string, any>) || {};
  const savedDeliveryAddress =
    preferredAttrs['savedAddress'] ||
    (lastOrderWithAddress?.deliveryAddress as any) ||
    metadata['pendingDeliveryAddress'] ||
    undefined;

  const currentDeliveryAddress =
    metadata['deliveryAddress'] ||
    metadata['pendingDeliveryAddress'] ||
    savedDeliveryAddress ||
    undefined;

  const addressConfirmed = Boolean(metadata['addressConfirmed']);
  const isReturningCustomer = Boolean(
    customerMemory.totalOrders > 0 ||
    customerMemory.isRepeatCustomer ||
    savedDeliveryAddress
  );

  // 8. Check for incomplete / pending payment order (within last 48 hours)
  const pendingOrder = await prisma.order.findFirst({
    where: {
      tenantId,
      customerPhone,
      status: 'PENDING_PAYMENT',
      createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });

  const pendingOrderSummary = pendingOrder
    ? {
        orderId: pendingOrder.id,
        orderNumber: pendingOrder.orderNumber,
        total: Number(pendingOrder.total),
        currency: pendingOrder.currency,
        items: pendingOrder.items.map((i) => `${i.productName} (x${i.quantity})`),
        createdAt: pendingOrder.createdAt,
        paymentUrl: normalizePaymentUrl(pendingOrder.trackingUrl, {
          orderId: pendingOrder.id,
          amount: Number(pendingOrder.total),
          orderNumber: pendingOrder.orderNumber,
          tenantId,
        }),
      }
    : undefined;

  // 9. Calculate Bill Breakdown
  const FREE_SHIPPING_THRESHOLD = 1999;
  const STANDARD_SHIPPING = 99;
  const totalMrp = cart.items.reduce(
    (sum, item) => sum + ((item as any).mrp || item.price) * item.quantity,
    0
  );
  const totalDiscount = Math.max(0, totalMrp - cart.subtotal);
  const shippingCharge =
    cart.items.length === 0 ? 0 : cart.subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING;
  const netPayable = cart.subtotal + shippingCharge;

  // 10. Format PromptContext
  const persona = (tenant.persona as Record<string, any>) || {};
  const promptContext: PromptContext = {
    agentName: persona['agentName'] || 'Meera',
    storeName: tenant.name,
    currency: 'INR',
    currentStage: (conversation.stage as any) || 'GREETING',
    customerName: customerMemory.customerName || undefined,
    customerPreferences: (customerMemory.preferredAttributes as any) || undefined,
    cartSummary: {
      itemsCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: cart.subtotal,
      totalMrp,
      totalDiscount,
      shippingCharge,
      netPayable,
      items: cart.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        mrp: (i as any).mrp || i.price,
      })),
    },
    catalogContext: catalogContext || undefined,
    savedDeliveryAddress: savedDeliveryAddress || undefined,
    currentDeliveryAddress: currentDeliveryAddress || undefined,
    isReturningCustomer,
    addressConfirmed,
    pendingOrderSummary,
  };

  return {
    tenant,
    customerMemory,
    conversation,
    cart,
    history,
    promptContext,
  };
}
