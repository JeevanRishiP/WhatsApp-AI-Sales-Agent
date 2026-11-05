import { prisma } from '@wcos/db';

export interface SendWhatsAppResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export function cleanPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  return cleaned;
}

/**
 * Dispatches a real-time WhatsApp text message to a customer via Evolution API.
 */
export async function sendWhatsAppTextMessage(params: {
  tenantId: string;
  toPhone: string;
  text: string;
}): Promise<SendWhatsAppResult> {
  const { tenantId, toPhone, text } = params;

  try {
    // 1. Resolve tenant's WhatsApp instance name
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { whatsappInstanceName: true },
    });

    const instanceName = tenant?.whatsappInstanceName || 'wa_aura_luxe_01';
    const cleanNumber = cleanPhoneNumber(toPhone);

    const evolutionUrl = (
      process.env['EVOLUTION_API_URL'] || 'http://localhost:8080'
    ).replace(/\/$/, '');
    const evolutionKey =
      process.env['EVOLUTION_API_GLOBAL_KEY'] ||
      process.env['EVOLUTION_API_KEY'] ||
      '429683C4C97CA36CA8211152D4C54';

    const url = `${evolutionUrl}/message/sendText/${instanceName}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionKey,
      },
      body: JSON.stringify({
        number: cleanNumber,
        text,
        delay: 500,
        linkPreview: true,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.warn(`[WhatsApp] Evolution dispatch failed (${response.status}):`, data);
      const isNotRegistered = data?.response?.message?.[0]?.exists === false;
      if (isNotRegistered) {
        return {
          success: false,
          error: `Phone number +${cleanNumber} is not registered on WhatsApp.`,
        };
      }

      const errMsg =
        typeof data?.response?.message === 'string'
          ? data.response.message
          : data?.message || data?.error || `Failed to dispatch WhatsApp message (${response.status})`;
      return { success: false, error: errMsg };
    }

    const messageId = data?.key?.id || undefined;
    return { success: true, messageId };
  } catch (err: any) {
    console.error('[WhatsApp] Dispatch exception:', err);
    return {
      success: false,
      error: `Could not connect to WhatsApp gateway (${err.message || 'Service offline'})`,
    };
  }
}

