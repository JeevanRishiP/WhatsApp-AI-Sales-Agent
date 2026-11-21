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

  // 6. Pre-fetch relevant catalog products with multi-turn awareness and repetition prevention
  let catalogContext = '';

  // 6A. Track product codes already shown to customer in recent messages
  const shownProductCodes = new Set<string>();
  const productCodePattern = /\b([A-Z]{3}-[A-Z0-9]{3}-\d{2})\b/g;
  for (const m of recentMessages) {
    const matches = m.content.match(productCodePattern);
    if (matches) {
      for (const code of matches) {
        shownProductCodes.add(code.toUpperCase());
      }
    }
  }

  // 6B. Extract meaningful keywords (filtering out stopwords including generic terms like "saree")
  const STOPWORDS = new Set([
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'want', 'to', 'see', 'show', 'give', 'tell', 'need', 'looking', 'look',
    'some', 'more', 'are', 'there', 'any', 'please', 'can', 'in', 'the', 'only', 'what', 'have', 'all', 'and', 'for',
    'with', 'of', 'a', 'an', 'is', 'it', 'this', 'that', 'these', 'those', 'kodu', 'kalsu', 'tori', 'bhejo', 'dikhao',
    'aur', 'chahiye', 'beku', 'hai', 'ho', 'do', 'options', 'collection', 'collections', 'saree', 'sarees'
  ]);

  const rawWords = (currentMessageText || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  let meaningfulKeywords = rawWords.filter((w) => !STOPWORDS.has(w));

  // If current message has no specific keywords (e.g. "Only 3", "show more", "any other"),
  // inspect the previous customer message in the conversation to retain intent
  if (meaningfulKeywords.length === 0) {
    const prevCustomerMsgs = recentMessages.filter((m) => m.role === 'customer');
    if (prevCustomerMsgs.length >= 2) {
      const priorMsg = prevCustomerMsgs[prevCustomerMsgs.length - 2]?.content || '';
      const priorWords = priorMsg
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
      if (priorWords.length > 0) {
        meaningfulKeywords = priorWords;
      }
    }
  }

  // 6C. Query matching products across the full database using indexed normalized SKU + keyword search
  const normalizedQueryCode = (currentMessageText || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const orConditions: any[] = [];
  if (normalizedQueryCode.length >= 4 && normalizedQueryCode.length <= 24) {
    orConditions.push({ codeNormalized: normalizedQueryCode });
  }
  for (const kw of meaningfulKeywords) {
    const cleanKw = kw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    orConditions.push(
      ...(cleanKw.length >= 3 ? [{ codeNormalized: { contains: cleanKw } }] : []),
      { name: { contains: kw, mode: 'insensitive' } },
      { subcategory: { contains: kw, mode: 'insensitive' } },
      { description: { contains: kw, mode: 'insensitive' } },
      { searchText: { contains: kw, mode: 'insensitive' } },
      { tags: { has: kw } }
    );
  }

  const [matchedProducts, availableSubcategories] = await Promise.all([
    prisma.product.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        ...(orConditions.length > 0 ? { OR: orConditions } : {}),
      },
      take: 20, // generous window so all items in collection (e.g. all 5 Paithani sarees) are available
      orderBy: { code: 'asc' },
    }),
    prisma.product.groupBy({
      by: ['subcategory'],
      where: { tenantId, status: 'ACTIVE' },
      _count: { code: true },
      _min: { price: true },
      _max: { price: true },
    }),
  ]);

  if (matchedProducts.length > 0) {
    const unshown = matchedProducts.filter((p) => !shownProductCodes.has(p.code.toUpperCase()));
    const alreadyShown = matchedProducts.filter((p) => shownProductCodes.has(p.code.toUpperCase()));

    catalogContext += `SPECIFIC MATCHING PRODUCTS IN STOCK (${matchedProducts.length} items found):\n`;
    if (shownProductCodes.size > 0 && unshown.length > 0) {
      catalogContext += `⚠️ NOTE: Customer has already seen: [${Array.from(shownProductCodes).join(', ')}].\n`;
      catalogContext += `👉 PRIORITIZE PRESENTING THESE FRESH UN-SHOWN PIECES FIRST:\n`;
    }

    const sortedProducts = [...unshown, ...alreadyShown];
    catalogContext += sortedProducts
      .map(
        (p) =>
          `- [Code: ${p.code}] *${p.name}* | Subcategory: ${p.subcategory || p.category || 'Catalog'} | Price: ₹${Number(p.salePrice || p.price)} | Stock: ${p.stock > 0 ? `${p.stock} available` : 'OUT OF STOCK'}${shownProductCodes.has(p.code.toUpperCase()) ? ' (ALREADY SHOWN TO CUSTOMER)' : ' (NEW/UNSHOWN)'}\n  ${p.description || ''}`
      )
      .join('\n');
  }

  // Append full store collection directory so the agent uses the complete database
  if (availableSubcategories.length > 0) {
    const collectionsList = availableSubcategories
      .filter((s) => s.subcategory)
      .map((s) => `• *${s.subcategory}* (${s._count.code} items, ₹${Number(s._min.price)} - ₹${Number(s._max.price)})`)
      .join('\n');

    catalogContext += `\n\nALL AVAILABLE STORE COLLECTIONS IN DATABASE:\n${collectionsList}`;
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

  // 7B. Query saved addresses from CustomerAddress table
  const phoneClean = customerPhone.replace(/[^0-9]/g, '');
  const phoneVariants = [
    customerPhone,
    `+${phoneClean}`,
    phoneClean,
    phoneClean.replace(/^91/, ''),
    `+91${phoneClean.replace(/^91/, '')}`,
    `91${phoneClean.replace(/^91/, '')}`,
  ];

  const dbCustomer = await prisma.customer.findFirst({
    where: {
      tenantId,
      phone: { in: phoneVariants },
    },
    include: {
      addresses: {
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      },
    },
  });

  const savedDeliveryAddresses = dbCustomer?.addresses?.map((a) => ({
    id: a.id,
    label: a.label || undefined,
    name: a.recipientName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 || undefined,
    landmark: a.landmark || undefined,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    isDefault: a.isDefault,
  })) || [];

  const defaultSaved = savedDeliveryAddresses.find((a) => a.isDefault) || savedDeliveryAddresses[0];

  const preferredAttrs = (customerMemory.preferredAttributes as Record<string, any>) || {};
  const savedDeliveryAddress =
    defaultSaved ||
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
    savedDeliveryAddress ||
    savedDeliveryAddresses.length > 0
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

  // 9. Calculate Bill Breakdown from tenant storePolicies
  const policies = (tenant.storePolicies as Record<string, any>) || {};
  const FREE_SHIPPING_THRESHOLD = Number(policies['freeShippingThreshold'] ?? 1999);
  const STANDARD_SHIPPING = Number(policies['shippingFee'] ?? 99);
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
  const aiPersona = ((tenant.aiConfig as Record<string, any>)?.['persona'] as Record<string, any>) || {};
  const agentName =
    String(
      persona['botName'] ||
        persona['agentName'] ||
        aiPersona['botName'] ||
        aiPersona['agentName'] ||
        ''
    ).trim() || 'Store Concierge';
  const promptContext: PromptContext = {
    agentName,
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
    savedDeliveryAddresses: savedDeliveryAddresses.length > 0 ? savedDeliveryAddresses : undefined,
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
