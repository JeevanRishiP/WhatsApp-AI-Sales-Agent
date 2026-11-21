import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { prisma } from '@wcos/db';
import { toggleAiAgent } from '@/lib/dal/settings';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ToggleSchema = z.object({
  enabled: z.boolean(),
});

export async function GET() {
  const session = await verifySession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: { aiConfig: true, ownerPhone: true },
    });

    const aiConfig = (tenant?.aiConfig as Record<string, any>) || {};
    const aiAgentEnabled = aiConfig.aiAgentEnabled !== false;

    return NextResponse.json({
      aiAgentEnabled,
      offlineSupportPhone: aiConfig.offlineSupportPhone || tenant?.ownerPhone || null,
      offlineMessage: aiConfig.offlineMessage || null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to fetch AI agent status' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await verifySession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role !== 'OWNER' && session.role !== 'STORE_MANAGER') {
    return NextResponse.json({ error: 'Forbidden: insufficient permissions' }, { status: 403 });
  }

  try {
    const rawBody = await req.json();
    const parsed = ToggleSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload: enabled boolean required' }, { status: 400 });
    }

    const updated = await toggleAiAgent(session.tenantId, parsed.data.enabled);

    revalidatePath('/', 'layout');
    revalidatePath('/settings');
    revalidatePath('/conversations');

    return NextResponse.json({
      success: true,
      aiAgentEnabled: updated,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to toggle AI agent status' },
      { status: 500 }
    );
  }
}

