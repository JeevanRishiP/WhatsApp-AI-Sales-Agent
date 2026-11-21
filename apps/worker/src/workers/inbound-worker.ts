import { Worker, type Job } from 'bullmq';
import { prisma } from '@wcos/db';
import {
  QUEUE_NAMES,
  createWorkerRedisConnection,
  getRedisCacheConnection,
  scheduleFollowUp,
  type InboundMessageJobData,
} from '@wcos/queue';
import { AIGateway, type TenantAiConfig } from '@wcos/ai';
import { decryptTenantSecrets, type TenantAiSecrets } from '@wcos/crypto';
import { normalizePaymentUrl } from '@wcos/payments';
import { ConversationLock } from '../lock/conversation-lock.js';
import { buildConversationContext } from '../orchestrator/context-builder.js';
import { ToolExecutionEngine } from '../tools/execution-engine.js';
import { EvolutionClient } from '../whatsapp/evolution-client.js';

const MAX_CONCURRENT_JOBS_PER_TENANT = Number(process.env['WORKER_MAX_TENANT_CONCURRENCY'] || 6);

const PAYMENT_CLAIM_REGEX =
  /\b(paid|payment done|payment sent|i paid|done the payment|transferred|i have paid|already paid|payment complete|sent the money|upi done|payment successful|payment kar diya|payment ho gaya|bhej diya)\b/i;

export function createInboundMessageWorker(): Worker<InboundMessageJobData> {
  const connection = createWorkerRedisConnection();
  const aiGateway = new AIGateway();
  const evolutionClient = new EvolutionClient();

  const worker = new Worker<InboundMessageJobData>(
    QUEUE_NAMES.INBOUND_MESSAGES,
    async (job: Job<InboundMessageJobData>) => {
      const { tenantId, message } = job.data;
      const { customerPhone, customerName, text: userText, id: providerMessageId } = message;

      console.log(`[InboundWorker] Processing job ${job.id} for phone ${customerPhone}`);

      // 0. Per-tenant fair concurrency guard (prevents one noisy tenant starving all worker slots)
      const cacheRedis = getRedisCacheConnection();
      const concurrencyKey = `ratelimit:worker-tenant:${tenantId}`;
      let activeSlotsAcquired = false;
      try {
        const activeCount = await cacheRedis.incr(concurrencyKey);
        if (activeCount === 1) {
          await cacheRedis.expire(concurrencyKey, 60);
        }
        if (activeCount > MAX_CONCURRENT_JOBS_PER_TENANT) {
          await cacheRedis.decr(concurrencyKey);
          throw new Error(
            `Tenant ${tenantId} active worker concurrency (${activeCount}) exceeds limit (${MAX_CONCURRENT_JOBS_PER_TENANT}); retrying`
          );
        }
        activeSlotsAcquired = true;
      } catch (err: any) {
        if (err?.message?.includes('exceeds limit')) {
          throw err;
        }
        console.warn(`[InboundWorker] Fair concurrency check skipped: ${err?.message}`);
      }

      // 1. Acquire exclusive per-conversation lock (prevents parallel race conditions)
      let lock: Awaited<ReturnType<typeof ConversationLock.acquire>> = null;
      try {
        lock = await ConversationLock.acquire(tenantId, customerPhone);
        if (!lock) {
          console.warn(
            `[InboundWorker] Could not acquire lock for conversation ${customerPhone}. Re-throwing to retry via BullMQ.`
          );
          throw new Error(`Conversation lock timeout for ${customerPhone}`);
        }

        const trimmedText = (userText || '').trim();
        const effectiveUserText =
          trimmedText ||
          (message.type === 'image'
            ? '[Customer sent an image. Please acknowledge the image warmly and ask what specific product, style, or details they are looking for.]'
            : message.type === 'audio'
            ? '[Customer sent a voice note. Please politely let them know you received their audio and ask how you can assist or if they can share the details.]'
            : message.type === 'video'
            ? '[Customer sent a video. Please acknowledge the video and ask how you can assist.]'
            : message.type === 'document'
            ? '[Customer sent a document. Please acknowledge it and ask how you can help.]'
            : '[Customer sent a message]');

        // 2. Build full context (Tenant, Session, CustomerMemory, Cart, Catalog)
        const ctx = await buildConversationContext(
          tenantId,
          customerPhone,
          customerName,
          trimmedText || undefined
        );

        if (ctx.tenant.status !== 'ACTIVE') {
          console.warn(
            `[InboundWorker] Skipping job ${job.id}: tenant ${tenantId} is ${ctx.tenant.status}`
          );
          return;
        }

        const instanceName = ctx.tenant.whatsappInstanceName;
        if (!instanceName) {
          console.warn(
            `[InboundWorker] Skipping job ${job.id}: tenant ${tenantId} has no whatsappInstanceName`
          );
          return;
        }

        // 3. Persist incoming customer message to Message log
        await prisma.message.create({
          data: {
            conversationId: ctx.conversation.id,
            tenantId,
            role: 'customer',
            content: trimmedText || (message.type === 'image' ? '[Customer sent an image]' : '[Customer sent a message]'),
            whatsappMessageId: providerMessageId,
            messageType: message.type,
          },
        });

        // 3a. Check if conversation is currently handed off to a human agent
        if (ctx.conversation.stage === 'HUMAN_HANDOFF') {
          console.log(
            `[InboundWorker] Conversation ${customerPhone} is currently handed off to human. Skipping AI response.`
          );
          return;
        }

        const tenantAiConfig = (ctx.tenant.aiConfig as TenantAiConfig) || undefined;
        const rawSupportPhone =
          (tenantAiConfig as any)?.offlineSupportPhone ||
          ctx.tenant.supportPhone ||
          ctx.tenant.ownerPhone ||
          '';
        const cleanPhone = String(rawSupportPhone).trim();
        const formattedPhone =
          cleanPhone.length === 10
            ? `+91 ${cleanPhone.slice(0, 5)} ${cleanPhone.slice(5)}`
            : cleanPhone || 'our store support team';

        // 3b. Atomic tenant monthly message quota enforcement
        const quotaUpdated = await prisma.$executeRaw`
          UPDATE "Tenant"
          SET "monthlyMessageCount" = "monthlyMessageCount" + 1
          WHERE id = ${tenantId}::uuid
            AND status = 'ACTIVE'
            AND "monthlyMessageCount" < "monthlyMessageLimit"
        `;
        if (Number(quotaUpdated) === 0) {
          console.warn(
            `[InboundWorker] Tenant ${tenantId} has reached its monthlyMessageLimit (${ctx.tenant.monthlyMessageLimit}). Skipping automated reply.`
          );
          return;
        }

        // 3c. Pre-LLM DB-level Fraud Guard for AWAITING_PAYMENT
        if (ctx.conversation.stage === 'AWAITING_PAYMENT' && ctx.conversation.pendingOrderId) {
          const pendingOrder = await prisma.order.findFirst({
            where: { id: ctx.conversation.pendingOrderId, tenantId },
          });

          if (
            pendingOrder &&
            (pendingOrder.status === 'PAYMENT_CONFIRMED' ||
              pendingOrder.status === 'PROCESSING' ||
              pendingOrder.status === 'SHIPPED' ||
              pendingOrder.status === 'DELIVERED')
          ) {
            await prisma.conversation.update({
              where: { id: ctx.conversation.id },
              data: {
                stage: 'POST_ORDER',
                pendingOrderId: null,
                messageCount: { increment: 2 },
                lastMessageAt: new Date(),
              },
            });
            const confirmedReply = `✅ *Payment Already Confirmed!*\nYour order *#${pendingOrder.orderNumber}* has been received and is being processed. We'll send you shipping updates shortly! 📦`;
            await prisma.message.create({
              data: {
                conversationId: ctx.conversation.id,
                tenantId,
                role: 'assistant',
                content: confirmedReply,
                intent: 'ORDER_STATUS',
                actionTaken: 'PAYMENT_ALREADY_CONFIRMED',
              },
            });
            await evolutionClient.sendText(instanceName, customerPhone, confirmedReply);
            return;
          }

          if (pendingOrder && pendingOrder.status === 'PENDING_PAYMENT' && PAYMENT_CLAIM_REGEX.test(trimmedText)) {
            console.warn(
              `[FRAUD_GUARD] Customer ${customerPhone} claimed payment for order ${pendingOrder.orderNumber} via text — blocking LLM & waiting for gateway webhook.`
            );
            await prisma.auditLog
              .create({
                data: {
                  tenantId,
                  action: 'PAYMENT_CLAIM_WITHOUT_WEBHOOK',
                  resourceId: pendingOrder.id,
                  actorType: 'customer',
                  actorId: customerPhone,
                  metadata: { message: trimmedText, orderNumber: pendingOrder.orderNumber },
                },
              })
              .catch(() => {});

            const paymentUrl = normalizePaymentUrl(pendingOrder.trackingUrl, {
              orderId: pendingOrder.id,
              amount: Number(pendingOrder.total),
              orderNumber: pendingOrder.orderNumber,
              tenantId,
            });
            const fraudGuardReply = paymentUrl
              ? `🔒 *Payment Verification Pending*\n\nThank you! Our system automatically verifies payments via the gateway — we haven't received a confirmed signal for order *#${pendingOrder.orderNumber}* yet.\n\nIf you haven't paid yet, please use your secure payment link:\n👉 ${paymentUrl}\n\nIf you already paid, please allow 2–3 minutes for automatic confirmation, or reply *HELP* to connect with our team.`
              : `🔒 *Payment Verification Pending*\n\nThank you for the update! Our system automatically verifies payments — we haven't received confirmation for order *#${pendingOrder.orderNumber}* yet.\n\nPlease allow 2–3 minutes for automatic updates, or reply *HELP* to speak with our team.`;

            await prisma.message.create({
              data: {
                conversationId: ctx.conversation.id,
                tenantId,
                role: 'assistant',
                content: fraudGuardReply,
                intent: 'PAYMENT_VERIFICATION_PENDING',
                actionTaken: 'FRAUD_GUARD_BLOCK',
              },
            });
            await prisma.conversation.update({
              where: { id: ctx.conversation.id },
              data: {
                lastIntent: 'PAYMENT_VERIFICATION_PENDING',
                messageCount: { increment: 2 },
                lastMessageAt: new Date(),
              },
            });
            await evolutionClient.sendText(instanceName, customerPhone, fraudGuardReply);
            return;
          }
        }

        const isAiAgentEnabled = (tenantAiConfig as any)?.aiAgentEnabled !== false;

        // 3d. If the WhatsApp AI Agent is switched OFF by the store owner:
        if (!isAiAgentEnabled) {
          console.log(
            `[InboundWorker] WhatsApp AI agent is switched OFF for tenant "${ctx.tenant.name}". Sending polite offline auto-reply.`
          );

          const storeName = ctx.tenant.name || 'our store';
          const baseDomain = (process.env['STOREFRONT_BASE_URL'] || process.env['STOREFRONT_URL'] || '').replace(/\/$/, '');
          const storefrontBaseUrl = ctx.tenant.customDomain
            ? `https://${ctx.tenant.customDomain}`
            : baseDomain
            ? `${baseDomain}/${ctx.tenant.slug}`
            : `http://localhost:3005/${ctx.tenant.slug}`;

          const customTemplate = (tenantAiConfig as any)?.offlineMessage;
          let offlineReply = '';

          if (customTemplate && typeof customTemplate === 'string' && customTemplate.trim().length > 0) {
            offlineReply = customTemplate
              .replace(/{storeName}/g, storeName)
              .replace(/{websiteUrl}/g, storefrontBaseUrl)
              .replace(/{supportPhone}/g, formattedPhone);
          } else {
            offlineReply = `Hello! 👋 Thank you for reaching out to *${storeName}*.\n\n` +
              `Our automated WhatsApp sales assistant is currently *offline* at the moment. 🌙\n\n` +
              `🛍️ *Continue Shopping On Our Website:*\n` +
              `You can browse our complete collection, view fresh arrivals, and securely place orders online 24/7:\n` +
              `👉 ${storefrontBaseUrl}\n\n` +
              `📞 *Need Immediate Assistance or Have Queries?*\n` +
              `For any order queries or assistance, please contact our support team directly at:\n` +
              `📲 *${formattedPhone}* (Call / WhatsApp)\n\n` +
              `We appreciate your patience and look forward to serving you! ✨`;
          }

          await prisma.message.create({
            data: {
              conversationId: ctx.conversation.id,
              tenantId,
              role: 'assistant',
              content: offlineReply,
              intent: 'OFFLINE_NOTICE',
              actionTaken: 'OFFLINE_AUTO_REPLY',
            },
          });

          await prisma.conversation.update({
            where: { id: ctx.conversation.id },
            data: {
              lastIntent: 'OFFLINE_NOTICE',
              messageCount: { increment: 2 },
              lastMessageAt: new Date(),
            },
          });

          await evolutionClient.sendText(instanceName, customerPhone, offlineReply);
          console.log(`[InboundWorker] Offline auto-reply sent successfully to ${customerPhone}`);
          return;
        }

        // 3e. When the AI agent is ON and customer wants to contact a human agent
        const humanRequestRegex = /\b(human|agent|support agent|live person|real person|customer care|executive|representative|speak to someone|talk to someone|connect me to someone|talk to owner|call me)\b/i;
        if (trimmedText && humanRequestRegex.test(trimmedText)) {
          console.log(
            `[InboundWorker] Customer ${customerPhone} explicitly requested human contact: "${trimmedText}". Transitioning to HUMAN_HANDOFF.`
          );

          const handoffReply = `I've alerted our store team right away! A live support representative will join this chat shortly to assist you personally. 👤🤝\n\nFor immediate telephone assistance or urgent questions, you can also reach our team directly at *${formattedPhone}*.`;

          await prisma.conversation.update({
            where: { id: ctx.conversation.id },
            data: {
              stage: 'HUMAN_HANDOFF',
              handoffReason: 'Customer requested human assistance via chat',
              lastIntent: 'HUMAN_HANDOFF',
              messageCount: { increment: 2 },
              lastMessageAt: new Date(),
            },
          });

          await prisma.message.create({
            data: {
              conversationId: ctx.conversation.id,
              tenantId,
              role: 'assistant',
              content: handoffReply,
              intent: 'HUMAN_HANDOFF',
              actionTaken: 'REQUEST_HUMAN_HANDOFF',
            },
          });

          await evolutionClient.sendText(instanceName, customerPhone, handoffReply);
          console.log(`[InboundWorker] Human handoff initiated and confirmed for ${customerPhone}`);
          return;
        }

        // 4. Decrypt per-tenant AI keys (falls back to worker environment keys when unset)
        let tenantAiSecrets: TenantAiSecrets | undefined;
        if (ctx.tenant.aiKeysEncrypted) {
          try {
            tenantAiSecrets = decryptTenantSecrets<TenantAiSecrets>(tenantId, ctx.tenant.aiKeysEncrypted) || undefined;
          } catch (keyErr: any) {
            console.warn(
              `[InboundWorker] Failed to decrypt aiKeysEncrypted for tenant ${tenantId}: ${keyErr?.message}`
            );
          }
        }

        // 5. Run AI Gateway inference with automatic model fallback & timeout
        const startTime = Date.now();
        const aiResult = await aiGateway.processMessage({
          context: ctx.promptContext,
          history: ctx.history,
          currentMessage: effectiveUserText,
          tier: 'fast',
          tenantAiConfig,
          keys: tenantAiSecrets,
        });
        const latencyMs = Date.now() - startTime;

        const { response: aiEnvelope, telemetry } = aiResult;

        // 6. Execute LLM action in Tool Execution Engine
        const toolResult = await ToolExecutionEngine.execute(
          tenantId,
          ctx.conversation,
          ctx.cart,
          aiEnvelope.action
        );

        const finalReply = toolResult.reply || aiEnvelope.message;

        // 7. Update Customer Memory if the LLM extracted customer preferences
        if (aiEnvelope.customerMemoryUpdate) {
          const currentAttributes =
            (ctx.customerMemory.preferredAttributes as Record<string, any>) || {};
          await prisma.customerMemory.update({
            where: { id: ctx.customerMemory.id },
            data: {
              preferredAttributes: {
                ...currentAttributes,
                ...aiEnvelope.customerMemoryUpdate,
              },
              totalMessages: { increment: 1 },
              lastContactAt: new Date(),
            },
          });
        }

        // 8. Persist assistant response to Message log
        await prisma.message.create({
          data: {
            conversationId: ctx.conversation.id,
            tenantId,
            role: 'assistant',
            content: finalReply,
            intent: aiEnvelope.intent,
            actionTaken: aiEnvelope.action.action,
            llmModel: telemetry.modelName,
            inputTokens: telemetry.usage?.promptTokens,
            outputTokens: telemetry.usage?.completionTokens,
            latencyMs,
          },
        });

        // 9. Update conversation turn counters and last interaction
        const convUpdateData: any = {
          lastIntent: aiEnvelope.intent,
          messageCount: { increment: 2 },
          lastMessageAt: new Date(),
        };
        if (toolResult.newStage) {
          convUpdateData.stage = toolResult.newStage;
        }
        await prisma.conversation.update({
          where: { id: ctx.conversation.id },
          data: convUpdateData,
        });

        // 9b. Schedule automated follow-ups for active carts and pending payments
        if (toolResult.newStage === 'CART_ACTIVE') {
          await scheduleFollowUp(
            {
              tenantId,
              customerId: ctx.conversation.id,
              sessionId: ctx.conversation.id,
              followUpType: 'cart_abandonment_1h',
            },
            60 * 60 * 1000
          ).catch((e) => console.warn('[InboundWorker] Failed to schedule cart abandonment follow-up:', e?.message));
        } else if (toolResult.newStage === 'AWAITING_PAYMENT') {
          await scheduleFollowUp(
            {
              tenantId,
              customerId: ctx.conversation.id,
              sessionId: ctx.conversation.id,
              followUpType: 'payment_reminder_15m',
            },
            15 * 60 * 1000
          ).catch((e) => console.warn('[InboundWorker] Failed to schedule payment reminder follow-up:', e?.message));
        }

        // 10. Dispatch WhatsApp response to customer via Evolution API
        let sentResult: any = null;
        try {
          sentResult = await evolutionClient.sendText(instanceName, customerPhone, finalReply);
        } catch (dispatchErr: any) {
          console.warn(
            `[InboundWorker] Initial dispatch to ${customerPhone} failed (${dispatchErr?.message}). Refreshing WhatsApp instance and retrying...`
          );
          await evolutionClient.restartInstance(instanceName).catch(() => {});
          await new Promise((r) => setTimeout(r, 2000));
          sentResult = await evolutionClient.sendText(instanceName, customerPhone, finalReply);
        }

        const sentMsgId = sentResult?.key?.id;
        if (sentMsgId) {
          await prisma.message.updateMany({
            where: {
              conversationId: ctx.conversation.id,
              role: 'assistant',
              whatsappMessageId: null,
            },
            data: { whatsappMessageId: sentMsgId },
          });
        }

        if (toolResult.mediaUrl) {
          evolutionClient
            .sendMedia(instanceName, customerPhone, toolResult.mediaUrl, '', 'image')
            .catch(() => {});
        }

        console.log(`[InboundWorker] Successfully replied to ${customerPhone}`);
      } finally {
        if (lock) {
          await lock.release().catch(() => {});
        }
        if (activeSlotsAcquired) {
          await cacheRedis
            .decr(concurrencyKey)
            .then(async (val) => {
              if (val <= 0) await cacheRedis.del(concurrencyKey);
            })
            .catch(() => {});
        }
      }
    },
    {
      connection,
      concurrency: 10,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[InboundWorker] Job ${job?.id} failed:`, err);
  });

  return worker;
}
