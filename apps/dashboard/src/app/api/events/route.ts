import { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth';
import { prisma } from '@wcos/db';

export const dynamic = 'force-dynamic';

/**
 * Lightweight Server-Sent Events (SSE) stream for tenant-scoped real-time
 * human handoff alerts, reducing repetitive client polling overhead.
 */
export async function GET(req: NextRequest) {
  const session = await verifySession();
  if (!session?.tenantId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const tenantId = session.tenantId;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let lastDigest = '';
      let ticks = 0;

      const safeClose = () => {
        if (!closed) {
          closed = true;
          clearInterval(pollTimer);
          clearInterval(pingTimer);
          try {
            controller.close();
          } catch {
            // Stream already closed
          }
        }
      };

      const pushHandoffSnapshot = async () => {
        if (closed || req.signal.aborted) {
          safeClose();
          return;
        }
        try {
          const handoffs = await prisma.conversation.findMany({
            where: { tenantId, stage: 'HUMAN_HANDOFF' },
            orderBy: { lastMessageAt: 'desc' },
            take: 10,
            select: {
              id: true,
              customerPhone: true,
              handoffReason: true,
              lastMessageAt: true,
            },
          });

          const count = handoffs.length;
          const digest = `${count}:${handoffs[0]?.id || ''}:${handoffs[0]?.lastMessageAt?.toISOString() || ''}`;
          if (digest !== lastDigest) {
            lastDigest = digest;
            const payload = JSON.stringify({
              count,
              queue: handoffs.map((c) => ({
                id: c.id,
                customerPhone: c.customerPhone,
                customerName: null,
                handoffReason: c.handoffReason || 'Customer requested human agent',
                updatedAt: c.lastMessageAt.toISOString(),
                lastMessage: null,
              })),
            });
            controller.enqueue(encoder.encode(`event: handoff_status\ndata: ${payload}\n\n`));
          }

          ticks += 1;
          // Recycle connection cleanly every ~60s to prevent orphaned serverless streams
          if (ticks >= 12) {
            safeClose();
          }
        } catch {
          // Transient query failure: wait for next tick
        }
      };

      const pollTimer = setInterval(pushHandoffSnapshot, 5000);
      const pingTimer = setInterval(() => {
        if (closed || req.signal.aborted) {
          safeClose();
          return;
        }
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          safeClose();
        }
      }, 15000);

      req.signal.addEventListener('abort', safeClose);
      await pushHandoffSnapshot();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
