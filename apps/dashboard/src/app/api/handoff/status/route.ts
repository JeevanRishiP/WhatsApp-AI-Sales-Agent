import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { prisma } from '@wcos/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await verifySession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {

    const handoffs = await prisma.conversation.findMany({
      where: {
        tenantId: session.tenantId,
        stage: 'HUMAN_HANDOFF',
      },
      orderBy: { lastMessageAt: 'desc' },
      select: {
        id: true,
        customerPhone: true,
        handoffReason: true,
        lastMessageAt: true,
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            content: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });

    // Also look up customer names if available
    const phones = handoffs.map((h) => h.customerPhone);
    const customers = await prisma.customer.findMany({
      where: {
        tenantId: session.tenantId,
        phone: { in: phones },
      },
      select: { phone: true, name: true },
    });

    const nameMap = new Map(customers.map((c) => [c.phone, c.name]));

    const queue = handoffs.map((item) => ({
      id: item.id,
      customerPhone: item.customerPhone,
      customerName: nameMap.get(item.customerPhone) || null,
      handoffReason: item.handoffReason || 'Customer requested human agent',
      updatedAt: item.lastMessageAt.toISOString(),
      lastMessage: item.messages[0]?.content || null,
    }));

    return NextResponse.json({
      count: queue.length,
      queue,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch handoff status' },
      { status: 500 }
    );
  }
}
