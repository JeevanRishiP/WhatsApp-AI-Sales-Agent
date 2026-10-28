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

      try {
        // 2. Build full context (Tenant, Session, CustomerMemory, Cart, Catalog)
        const ctx = await buildConversationContext(
          tenantId,
          customerPhone,
          customerName,
          userText
        );

        // 3. Persist incoming customer message to Message log
        await prisma.message.create({
          data: {
            conversationId: ctx.conversation.id,
            tenantId,
            role: 'customer',
            content: userText || '[Non-text message]',
            whatsappMessageId: providerMessageId,
            messageType: message.type,
          },
        });

        // Check if conversation is currently handed off to a human agent
        if (ctx.conversation.stage === 'HUMAN_HANDOFF') {
          console.log(
            `[InboundWorker] Conversation ${customerPhone} is currently handed off to human. Skipping AI response.`
          );
          return;
        }

        // 4. Run AI Gateway inference with automatic model fallback
        const startTime = Date.now();
        const tenantAiConfig = (ctx.tenant.aiConfig as TenantAiConfig) || undefined;
        const aiResult = await aiGateway.processMessage({
          context: ctx.promptContext,
          history: ctx.history,
          currentMessage: userText || '',
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
