import { Worker, type Job } from 'bullmq';
import { prisma } from '@wcos/db';
import { QUEUE_NAMES, getRedisConnection, type InboundMessageJobData } from '@wcos/queue';
import { AIGateway, type TenantAiConfig } from '@wcos/ai';
import { ConversationLock } from '../lock/conversation-lock.js';
import { buildConversationContext } from '../orchestrator/context-builder.js';
import { ToolExecutionEngine } from '../tools/execution-engine.js';
import { EvolutionClient } from '../whatsapp/evolution-client.js';

export function createInboundMessageWorker(): Worker<InboundMessageJobData> {
  const connection = getRedisConnection();
  const aiGateway = new AIGateway();
  const evolutionClient = new EvolutionClient();

  const worker = new Worker<InboundMessageJobData>(
    QUEUE_NAMES.INBOUND_MESSAGES,
    async (job: Job<InboundMessageJobData>) => {
      const { tenantId, message } = job.data;
      const { customerPhone, customerName, text: userText, id: providerMessageId } = message;

      console.log(`[InboundWorker] Processing job ${job.id} for phone ${customerPhone}`);

      // 1. Acquire exclusive per-conversation lock (prevents parallel race conditions)
      const lock = await ConversationLock.acquire(tenantId, customerPhone);
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
          ? '[Customer sent an image. Please acknowledge the image warmly and ask what specific style, saree, or product details they are looking for.]'
          : message.type === 'audio'
          ? '[Customer sent a voice note. Please politely let them know you received their audio and ask how you can assist or if they can share the details.]'
          : message.type === 'video'
          ? '[Customer sent a video. Please acknowledge the video and ask how you can assist.]'
          : message.type === 'document'
          ? '[Customer sent a document. Please acknowledge it and ask how you can help.]'
          : '[Customer sent a message]');

      try {
        // 2. Build full context (Tenant, Session, CustomerMemory, Cart, Catalog)
        const ctx = await buildConversationContext(
          tenantId,
          customerPhone,
          customerName,
          trimmedText || undefined
        );

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
        const isAiAgentEnabled = (tenantAiConfig as any)?.aiAgentEnabled !== false;

        // 3b. If the WhatsApp AI Agent is switched OFF by the store owner:
        if (!isAiAgentEnabled) {
          console.log(
            `[InboundWorker] WhatsApp AI agent is switched OFF for tenant "${ctx.tenant.name}". Sending polite offline auto-reply.`
          );

          const storeName = ctx.tenant.name || 'our store';
          const supportPhone = (tenantAiConfig as any)?.offlineSupportPhone || '8105845527';
          const cleanPhone = String(supportPhone).trim();
          const formattedPhone = cleanPhone.length === 10 ? `+91 ${cleanPhone.slice(0, 5)} ${cleanPhone.slice(5)}` : cleanPhone;
          
          const storefrontBaseUrl = process.env['STOREFRONT_URL'] ||
            (ctx.tenant.customDomain
              ? `https://${ctx.tenant.customDomain}`
              : ctx.tenant.slug
              ? `http://localhost:3005/${ctx.tenant.slug}`
              : 'http://localhost:3005');

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
              `For any order queries, styling advice, or assistance, please contact our support team directly at:\n` +
              `📲 *${formattedPhone}* (Call / WhatsApp)\n\n` +
              `We appreciate your patience and look forward to serving you! ✨`;
          }

          // Persist the offline auto-reply message to DB
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

          // Update conversation turn counters and last interaction
          await prisma.conversation.update({
            where: { id: ctx.conversation.id },
            data: {
              lastIntent: 'OFFLINE_NOTICE',
              messageCount: { increment: 2 },
              lastMessageAt: new Date(),
            },
          });

          // Dispatch the offline reply to customer via WhatsApp
          const instanceName = ctx.tenant.whatsappInstanceName || 'sales-bot';
          await evolutionClient.sendText(instanceName, customerPhone, offlineReply);

          console.log(`[InboundWorker] Offline auto-reply sent successfully to ${customerPhone}`);
          return;
        }

        // 3c. When the AI agent is ON and customer wants to contact a human agent
        const humanRequestRegex = /\b(human|agent|support agent|live person|real person|customer care|executive|representative|speak to someone|talk to someone|connect me to someone|talk to owner|call me)\b/i;
        if (trimmedText && humanRequestRegex.test(trimmedText)) {
          console.log(
            `[InboundWorker] Customer ${customerPhone} explicitly requested human contact: "${trimmedText}". Transitioning to HUMAN_HANDOFF.`
          );

          const supportPhone = (tenantAiConfig as any)?.offlineSupportPhone || '8105845527';
          const cleanPhone = String(supportPhone).trim();
          const formattedPhone = cleanPhone.length === 10 ? `+91 ${cleanPhone.slice(0, 5)} ${cleanPhone.slice(5)}` : cleanPhone;

          const handoffReply = `I've alerted our store team right away! A live support representative will join this chat shortly to assist you personally. 👤🤝\n\nFor immediate telephone assistance or urgent questions, you can also reach our team directly at *${formattedPhone}*.`;

          // Update conversation stage to HUMAN_HANDOFF so sticky alert triggers on owner portal
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

          // Persist assistant message
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

          // Dispatch WhatsApp message to customer
          const instanceName = ctx.tenant.whatsappInstanceName || 'sales-bot';
          await evolutionClient.sendText(instanceName, customerPhone, handoffReply);

          console.log(`[InboundWorker] Human handoff initiated and confirmed for ${customerPhone}`);
          return;
        }

        // 4. Run AI Gateway inference with automatic model fallback
        const startTime = Date.now();
        const aiResult = await aiGateway.processMessage({
          context: ctx.promptContext,
          history: ctx.history,
          currentMessage: effectiveUserText,
          tier: 'fast',
          tenantAiConfig,
        });
        const latencyMs = Date.now() - startTime;

        const { response: aiEnvelope, telemetry } = aiResult;

        // 5. Execute LLM action in Tool Execution Engine
        const toolResult = await ToolExecutionEngine.execute(
          tenantId,
          ctx.conversation,
          ctx.cart,
          aiEnvelope.action
        );

        const finalReply = toolResult.reply || aiEnvelope.message;

        // 6. Update Customer Memory if the LLM extracted customer preferences
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

        // 7. Persist assistant response to Message log
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

        // 8. Update conversation turn counters and last interaction
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

        // 9. Dispatch WhatsApp response to customer via Evolution API
        const instanceName = ctx.tenant.whatsappInstanceName || 'sales-bot';

        // Send text first to guarantee fast, reliable delivery to customer
        await evolutionClient.sendText(instanceName, customerPhone, finalReply);

        // If product image is available, dispatch as media attachment
        if (toolResult.mediaUrl) {
          evolutionClient
            .sendMedia(instanceName, customerPhone, toolResult.mediaUrl, '', 'image')
            .catch(() => {});
        }

        console.log(`[InboundWorker] Successfully replied to ${customerPhone}`);
      } finally {
        // 10. Always release conversation lock so next messages can proceed sequentially
        await lock.release();
      }
    },
    {
      connection,
      concurrency: 10, // process up to 10 concurrent distinct conversations
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[InboundWorker] Job ${job?.id} failed:`, err);
  });

  return worker;
}
