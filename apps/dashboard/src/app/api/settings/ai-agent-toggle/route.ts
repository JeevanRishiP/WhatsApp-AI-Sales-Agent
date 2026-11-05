import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@wcos/db';
import { toggleAiAgent } from '@/lib/dal/settings';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: { aiConfig: true },
    });

    const aiConfig = (tenant?.aiConfig as Record<string, any>) || {};
    const aiAgentEnabled = aiConfig.aiAgentEnabled !== false;

    return NextResponse.json({
      aiAgentEnabled,
      offlineSupportPhone: aiConfig.offlineSupportPhone || '8105845527',
      offlineMessage: aiConfig.offlineMessage || null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch AI agent status' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const enabled = Boolean(body.enabled);

    const updated = await toggleAiAgent(session.tenantId, enabled);

    revalidatePath('/', 'layout');
    revalidatePath('/settings');
    revalidatePath('/conversations');

    return NextResponse.json({
      success: true,
      aiAgentEnabled: updated,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to toggle AI agent status' },
      { status: 500 }
    );
  }
}

