import { config } from '../config.js';

export class EvolutionService {
  private static cleanPhone(phone: string): string {
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
   * Dispatches a WhatsApp text message to a customer via the store's Evolution API instance.
   */
  static async sendTextMessage(instanceName: string, toPhone: string, text: string): Promise<boolean> {
    const cleanNumber = this.cleanPhone(toPhone);
    const url = `${config.EVOLUTION_API_URL.replace(/\/$/, '')}/message/sendText/${instanceName}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: config.EVOLUTION_API_GLOBAL_KEY,
        },
        body: JSON.stringify({
          number: cleanNumber,
          text,
          delay: 500,
          linkPreview: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[EvolutionService] WhatsApp dispatch error [${response.status}]: ${errorText}`);
        return false;
      }

      return true;
    } catch (err: any) {
      console.warn(`[EvolutionService] WhatsApp dispatch failed (service might be offline in dev):`, err.message);
      return false;
    }
  }
}

