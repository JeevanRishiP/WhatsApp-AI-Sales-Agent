import { type Job } from 'bullmq';
import { prisma } from '@wcos/db';
import {
  type InboundMessageJobData,
  enqueueOutboundMessage,
  scheduleFollowUp,
} from '@wcos/queue';
import { aiGateway, isAddressConfirmation } from '@wcos/ai';
import { ConversationLock } from '../lock/conversation-lock.js';
import { CartService } from '../cart/cart-service.js';
import { ToolExecutionEngine } from '../tools/execution-engine.js';
import { type StoredCart, type CartItemData } from '../orchestrator/context-builder.js';
import { normalizePaymentUrl } from '@wcos/payments';

export async function processInboundMessage(job: Job<InboundMessageJobData>): Promise<void> {
  const { tenantId, message } = job.data;
  const customerPhone = message.customerPhone;

  // 1. Acquire per-conversation distributed lock
  const lock = await ConversationLock.acquire(tenantId, customerPhone);
  if (!lock) {
    throw new Error(`Could not acquire conversation lock for ${tenantId}:${customerPhone}. Job will retry.`);
  }

  try {
    // 2. Fetch tenant
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      console.warn(`[InboundProcessor] Tenant ${tenantId} not found. Skipping.`);
      return;
    }

    // 3. Find or create conversation
    let conversation = await prisma.conversation.findUnique({
      where: { tenantId_customerPhone: { tenantId, customerPhone } },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          tenantId,
          customerPhone,
          stage: 'GREETING',
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        },
      });
    }

    // 4. Record customer message
    const userText = message.text || message.buttonPayload || message.listPayload || '';
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        tenantId,
        role: 'customer',
        content: userText || '[Non-text message]',
        messageType: message.type,
        whatsappMessageId: message.id,
      },
    });

    // ─────────────────────────────────────────────────────────────────────────
    // ⚠️  CRITICAL FRAUD GUARD — AWAITING_PAYMENT STAGE
    //
    // When we are waiting for payment, we MUST NOT trust any customer text
    // claiming payment was made. Payment is ONLY confirmed via the gateway
    // webhook (Razorpay / PhonePe). This block intercepts ALL messages in
    // AWAITING_PAYMENT and re-sends the real payment link from the DB.
    // ─────────────────────────────────────────────────────────────────────────
    if (conversation.stage === 'AWAITING_PAYMENT' && conversation.pendingOrderId) {
      const pendingOrder = await prisma.order.findUnique({
        where: { id: conversation.pendingOrderId },
        include: { items: true },
      });

      // If the order was confirmed via webhook while the customer was typing, acknowledge it
      if (
        pendingOrder &&
        (pendingOrder.status === 'PAYMENT_CONFIRMED' ||
          pendingOrder.status === 'PROCESSING' ||
          pendingOrder.status === 'SHIPPED' ||
          pendingOrder.status === 'DELIVERED')
      ) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            stage: 'POST_ORDER',
            pendingOrderId: null,
          },
        });
        const confirmedReply = `✅ *Payment Already Confirmed!*\nYour order *#${pendingOrder.orderNumber}* has been received and is being processed. We'll send you shipping updates shortly! 📦`;
        await saveAndSend(tenantId, conversation.id, customerPhone, confirmedReply, 'NONE');
        return;
      }

      // Payment NOT yet confirmed via webhook — block AI entirely, re-send real link
      if (pendingOrder && pendingOrder.status === 'PENDING_PAYMENT') {
        // trackingUrl is where the execution engine persists the payment URL
        const paymentUrl = normalizePaymentUrl(pendingOrder.trackingUrl, {
          orderId: pendingOrder.id,
          amount: Number(pendingOrder.total),
          orderNumber: pendingOrder.orderNumber,
          tenantId,
        });
        const userMsgLower = userText.toLowerCase().trim();

        // Detect if customer is claiming they paid — log this as a suspicious event
        const claimingPayment =
          /\b(paid|payment done|payment sent|i paid|done the payment|transferred|i have paid|already paid|payment complete|sent the money|upi done|payment successful|payment kar diya|payment ho gaya|bhej diya)\b/i.test(
            userMsgLower
          );

        if (claimingPayment) {
          console.warn(
            `[FRAUD_GUARD] Customer ${customerPhone} claimed payment for order ${pendingOrder.orderNumber} via text — NOT auto-confirming. Awaiting gateway webhook.`
          );

          // Log suspicious claim as an audit event (non-fatal)
          await prisma.auditLog.create({
            data: {
              tenantId,
              action: 'PAYMENT_CLAIM_WITHOUT_WEBHOOK',
              resourceId: pendingOrder.id,
              actorType: 'customer',
              actorId: customerPhone,
              metadata: { message: userText, orderNumber: pendingOrder.orderNumber },
            },
          }).catch(() => {/* non-fatal */});

          const fraudGuardReply = paymentUrl
            ? `🔒 *Payment Verification Pending*\n\nThank you! Our system automatically verifies payments — we haven't received a confirmed payment signal for order *#${pendingOrder.orderNumber}* yet.\n\nIf you haven't paid yet, please complete via your secure payment link:\n👉 ${paymentUrl}\n\nIf you already paid and it's still pending, please give it 2–3 minutes and we'll update you automatically. You can also reply *HELP* to connect with our team! ✨`
            : `🔒 *Payment Verification Pending*\n\nThank you for the update! Our system automatically verifies all payments — we haven't received a confirmed signal yet for order *#${pendingOrder.orderNumber}*.\n\nPlease give it 2–3 minutes and we'll notify you instantly once confirmed. If you're facing any issues, please reply *HELP* to connect with our team. ✨`;

          await saveAndSend(tenantId, conversation.id, customerPhone, fraudGuardReply, 'NONE');
          return;
        }

        // Customer is asking something else (e.g. "where is the link?", "resend") — re-send link
        const resendReply = paymentUrl
          ? `⏳ *Awaiting Payment — Order #${pendingOrder.orderNumber}*\n\nYour items are reserved! Please complete your secure payment here:\n👉 ${paymentUrl}\n\n💳 *Accepted:* UPI, Cards, Netbanking.\n\nYour order will be confirmed instantly once payment is received! ✨`
          : `⏳ *Awaiting Payment — Order #${pendingOrder.orderNumber}*\n\nYour order is ready and items are reserved. If you didn't receive your payment link, please reply *HELP* and we'll resend it right away! ✨`;

        await saveAndSend(tenantId, conversation.id, customerPhone, resendReply, 'NONE');
        return;
      }
    }
    // ─── End AWAITING_PAYMENT guard ──────────────────────────────────────────

    // 5. Fetch recent conversation history
    const recentMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });

    const history = recentMessages
      .reverse()
      .filter((m) => m.role === 'customer' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // 6. Fetch active products
    const products = await prisma.product.findMany({
      where: { tenantId, status: 'ACTIVE' },
      take: 15,
      orderBy: { createdAt: 'desc' },
    });

    // 7. Get active cart from Redis
    const cart = await CartService.getCart(tenantId, customerPhone);

    // 8. Build pending order summary (if it exists) for AI context
    let pendingOrderSummary: any = undefined;
    if (conversation.pendingOrderId) {
      const po = await prisma.order.findUnique({
        where: { id: conversation.pendingOrderId },
        include: { items: true },
      });
      // trackingUrl holds the payment URL stored by the execution engine
      if (po && po.status === 'PENDING_PAYMENT' && po.trackingUrl) {
        pendingOrderSummary = {
          orderId: po.id,
          orderNumber: po.orderNumber,
          total: Number(po.total),
          currency: po.currency,
          items: po.items.map((i) => i.productName),
          createdAt: po.createdAt,
          paymentUrl: normalizePaymentUrl(po.trackingUrl, {
            orderId: po.id,
            amount: Number(po.total),
            orderNumber: po.orderNumber,
            tenantId,
          }),
        };
      }
    }

    // 9. Build customer memory context
    const customerMemory = await prisma.customerMemory.findUnique({
      where: { tenantId_customerPhone: { tenantId, customerPhone } },
    });
    // preferredAttributes is a JSON field that may hold savedAddress, preferences, etc.
    const memAttribs = (customerMemory?.preferredAttributes as Record<string, any>) || {};
    const memPrefs: Record<string, any> = {
      preferredCategories: customerMemory?.preferredCategories || [],
      ...memAttribs,
    };
    const savedAddress = (memAttribs['savedAddress'] as Record<string, any>) || null;
    const convoMeta = (conversation.metadata as Record<string, any>) || {};

    // ═══════════════════════════════════════════════════════════════════════════
    // DETERMINISTIC INTENT DISPATCH (Buttons, Address Confirmation, Payment Link Requests)
    // ═══════════════════════════════════════════════════════════════════════════
    // Button payloads (confirm_address, proceed_to_pay, change_address) or explicit
    // affirmations ("address is corect", "hu", "yes", "phonepe link kalsu") encode
    // unambiguous user intent. Routing them directly to the execution engine eliminates
    // latency, guarantees state transitions, and prevents LLM URL hallucinations.
    // ═══════════════════════════════════════════════════════════════════════════
    const rawButtonPayload = message.buttonPayload?.trim();
    const buttonId = rawButtonPayload?.toLowerCase();
    const lastAssistantMsg = history.filter((h) => h.role === 'assistant').slice(-1)[0]?.content || '';

    const isTextAddressConfirmation = isAddressConfirmation(
      userText,
      conversation.stage,
      lastAssistantMsg
    );

    const isPaymentLinkText =
      /\b(phonepe|phone\s*pe|google\s*pay|gpay|paytm|upi)\b.*\b(link|kalsu|kodu|send|share|pay|bhejo)\b/i.test(userText) ||
      /\b(link)\b.*\b(kalsu|kodu|bhejo|work\s*agthilla|not\s*working|broken|invalid|bere|another|new|send|share|give|resend)\b/i.test(userText) ||
      /\b(resend|send|give|generate|share|fresh|new|another|get|where|where's|where is)\b.*\b(payment|link|checkout|upi|qr|phonepe|razorpay|pay)\b/i.test(userText) ||
      /^(phonepe|link|pay|payment|checkout|pay now)\b/i.test(userText.trim()) ||
      /\b(link.*not.*working|link.*expired|link.*failed|didn't receive.*link|haven't received.*link|send.*again|resend.*now|pay.*now)\b/i.test(userText);

    const isConfirmAddressAction =
      buttonId === 'confirm_address' ||
      buttonId === 'proceed_to_pay' ||
      (conversation.stage === 'CHECKOUT_CONFIRM' && isTextAddressConfirmation) ||
      (convoMeta['pendingDeliveryAddress'] && isTextAddressConfirmation);

    const isLinkRequestAction =
      isPaymentLinkText &&
      (cart.items.length > 0 || !!conversation.pendingOrderId || !!pendingOrderSummary);

    if (buttonId === 'change_address') {
      const storedCartForBtn: StoredCart = {
        items: cart.items.map((i): CartItemData => ({
          productId: i.productId,
          productCode: i.productCode,
          name: i.productName,
          quantity: i.quantity,
          price: i.priceAtAdd,
          imageUrl: i.imageUrl,
        })),
        subtotal: cart.subtotal,
      };
      const conversationCtxForBtn = {
        ...conversation,
        metadata: {
          ...convoMeta,
          customerName: message.customerName,
          customerPlatform: convoMeta['customerPlatform'] || 'web',
        },
      };
      const btnAction = {
        action: 'REQUEST_DELIVERY_ADDRESS',
        reply: 'No problem! Please share your updated delivery address (Name, House/Street, City, Pincode): 📍',
      };
      const execResult = await ToolExecutionEngine.execute(
        tenantId,
        conversationCtxForBtn,
        storedCartForBtn,
        btnAction as any,
      );
      await saveAndSend(tenantId, conversation.id, customerPhone, execResult.reply || btnAction.reply, 'REQUEST_DELIVERY_ADDRESS');
      return;
    }

    if (isConfirmAddressAction || isLinkRequestAction) {
      const storedCartForBtn: StoredCart = {
        items: cart.items.map((i): CartItemData => ({
          productId: i.productId,
          productCode: i.productCode,
          name: i.productName,
          quantity: i.quantity,
          price: i.priceAtAdd,
          imageUrl: i.imageUrl,
        })),
        subtotal: cart.subtotal,
      };
      const conversationCtxForBtn = {
        ...conversation,
        metadata: {
          ...convoMeta,
          customerName: message.customerName,
          customerPlatform: convoMeta['customerPlatform'] || 'web',
        },
      };

      const resolvedAddress =
        (convoMeta['addressConfirmed'] && convoMeta['deliveryAddress'])
          ? convoMeta['deliveryAddress']
          : convoMeta['pendingDeliveryAddress'] || savedAddress;

      if (resolvedAddress || cart.items.length === 0 || !!conversation.pendingOrderId) {
        const btnAction = {
          action: 'INITIATE_CHECKOUT',
          deliveryAddress: resolvedAddress,
          reply: 'Generating your secure payment link...',
        };

        try {
          const execResult = await ToolExecutionEngine.execute(
            tenantId,
            conversationCtxForBtn,
            storedCartForBtn,
            btnAction as any,
          );
          const finalBtnReply = execResult.reply || (btnAction['reply'] as string);
          if (execResult.newStage === 'AWAITING_PAYMENT') {
            await scheduleFollowUp(
              { tenantId, customerId: conversation.id, sessionId: conversation.id, followUpType: 'payment_reminder_15m' },
              15 * 60 * 1000
            );
          }
          await saveAndSend(tenantId, conversation.id, customerPhone, finalBtnReply, 'INITIATE_CHECKOUT');
          return;
        } catch (btnErr: any) {
          console.error('[InboundProcessor] Deterministic checkout dispatch error:', btnErr.message);
          // Fall through to AI if error occurs
        }
      }
    }
    // ─── End Deterministic Dispatch ──────────────────────────────────────────────────────────

    // 10. Call AI Gateway
    const persona = (tenant.persona || {}) as Record<string, any>;
    const aiResult = await aiGateway.processMessage({
      context: {
        agentName: persona['botName'] || persona['agentName'] || 'Sales Assistant',
        storeName: tenant.name,
        currency: 'INR',
        currentStage: conversation.stage,
        customerName: message.customerName,
        customerPreferences: Object.keys(memPrefs).length > 0 ? memPrefs : undefined,
        isReturningCustomer: !!savedAddress,
        savedDeliveryAddress: savedAddress || undefined,
        addressConfirmed: convoMeta['addressConfirmed'] === true,
        currentDeliveryAddress: convoMeta['deliveryAddress'] || convoMeta['pendingDeliveryAddress'] || undefined,
        pendingOrderSummary,
        cartSummary: cart.itemCount > 0
          ? {
              itemsCount: cart.itemCount,
              subtotal: cart.subtotal,
              items: cart.items.map((i) => ({
                name: i.productName,
                quantity: i.quantity,
                price: i.priceAtAdd,
              })),
            }
          : undefined,
        catalogContext: products
          .map(
            (p) =>
              `- [Code: ${p.code}] *${p.name}* | Price: ₹${Number(p.salePrice || p.price)} | Stock: ${p.stock - p.reserved > 0 ? `${p.stock - p.reserved} available` : 'OUT OF STOCK'}`
          )
          .join('\n'),
      },
      currentMessage: userText,
      history,
      tier: 'fast',
    });

    const action = aiResult.response.action;
    let finalReply = aiResult.response.message || action.reply;
    let outboundMediaUrl: string | undefined;
    let newStage: string | undefined;

    // 11. Execute action via the execution engine (handles checkout, cart, addresses, etc.)
    try {
      // Inject customerName and customerPlatform into conversation metadata for the engine
      const conversationCtx = {
        ...conversation,
        metadata: {
          ...((conversation.metadata as object) || {}),
          customerName: message.customerName,
          customerPlatform: (convoMeta['customerPlatform'] as string) || 'web',
        },
      };

      // Convert Cart (Redis format) to StoredCart format expected by ToolExecutionEngine
      const storedCart: StoredCart = {
        items: cart.items.map((i): CartItemData => ({
          productId: i.productId,
          productCode: i.productCode,
          name: i.productName,
          quantity: i.quantity,
          price: i.priceAtAdd,
          imageUrl: i.imageUrl,
        })),
        subtotal: cart.subtotal,
      };

      const execResult = await ToolExecutionEngine.execute(
        tenantId,
        conversationCtx,
        storedCart,
        action,
      );

      if (execResult.reply) finalReply = execResult.reply;
      if (execResult.mediaUrl) outboundMediaUrl = execResult.mediaUrl;
      if (execResult.newStage) newStage = execResult.newStage;

      // 11B. Anti-Hallucination & Fake URL Interceptor
      // If the AI generated any fake/hallucinated domain or URL (e.g. pay.AuraLuxeBoutique.in, ALB-CHK...),
      // intercept it and execute INITIATE_CHECKOUT so the customer receives the real gateway URL!
      const FAKE_URL_PATTERN = /https?:\/\/(?:pay\.[a-z0-9.-]+|[a-z0-9.-]*auraluxe[a-z0-9.-]*|[a-z0-9.-]*alb-[a-z0-9.-]*)[^\s]*/i;
      if (FAKE_URL_PATTERN.test(finalReply)) {
        console.warn('[InboundProcessor] Detected hallucinated payment URL in AI reply. Intercepting with INITIATE_CHECKOUT.');
        const targetAddress =
          (convoMeta['addressConfirmed'] && convoMeta['deliveryAddress'])
            ? convoMeta['deliveryAddress']
            : convoMeta['pendingDeliveryAddress'] || savedAddress;

        const forcedCheckoutAction = {
          action: 'INITIATE_CHECKOUT',
          deliveryAddress: targetAddress,
          reply: 'Here is your official secure payment link: ✨',
        };

        const forcedResult = await ToolExecutionEngine.execute(
          tenantId,
          conversationCtx,
          storedCart,
          forcedCheckoutAction as any,
        );

        if (forcedResult.reply) {
          finalReply = forcedResult.reply;
          if (forcedResult.newStage) newStage = forcedResult.newStage;
        } else {
          finalReply = finalReply.replace(FAKE_URL_PATTERN, '').trim();
        }
      }

      // Schedule follow-ups based on new stage
      if (newStage === 'AWAITING_PAYMENT') {
        await scheduleFollowUp(
          {
            tenantId,
            customerId: conversation.id,
            sessionId: conversation.id,
            followUpType: 'payment_reminder_15m',
          },
          15 * 60 * 1000
        );
      } else if (newStage === 'CART_ACTIVE' || action.action === 'ADD_TO_CART') {
        await scheduleFollowUp(
          {
            tenantId,
            customerId: conversation.id,
            sessionId: conversation.id,
            followUpType: 'cart_abandonment_1h',
          },
          60 * 60 * 1000
        );
      }
    } catch (execErr: any) {
      console.error('[InboundProcessor] Execution engine error:', execErr.message);
      // Don't crash — fall back to the plain AI reply text
    }

    // 12. Record assistant response and deliver to WhatsApp
    await saveAndSend(
      tenantId,
      conversation.id,
      customerPhone,
      finalReply,
      action.action,
      aiResult.telemetry.modelName,
      aiResult.telemetry.usage?.promptTokens,
      aiResult.telemetry.usage?.completionTokens,
      outboundMediaUrl,
    );
  } finally {
    // 13. Always release conversation lock
    await lock.release();
  }
}

/** Saves assistant message to DB and enqueues outbound WhatsApp delivery */
async function saveAndSend(
  tenantId: string,
  conversationId: string,
  toPhone: string,
  text: string,
  actionTaken: string,
  llmModel?: string,
  inputTokens?: number,
  outputTokens?: number,
  mediaUrl?: string,
): Promise<void> {
  await prisma.message.create({
    data: {
      conversationId,
      tenantId,
      role: 'assistant',
      content: text,
      actionTaken,
      llmModel,
      inputTokens,
      outputTokens,
    },
  });

  await enqueueOutboundMessage({
    tenantId,
    toPhone,
    messageType: mediaUrl ? 'image' : 'text',
    text,
    mediaUrl,
    correlationId: `reply:${conversationId}:${Date.now()}`,
  });
}
