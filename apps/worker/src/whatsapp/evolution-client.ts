import { config } from '../config.js';

export interface EvolutionButton {
  id: string;
  title: string;
}

export class EvolutionClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl = config.EVOLUTION_API_URL, apiKey = config.EVOLUTION_API_GLOBAL_KEY) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private cleanPhone(phone: string): string {
    return phone.replace(/[^0-9]/g, '');
  }

  private async request<T = any>(endpoint: string, payload: any): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Evolution API error [${response.status}] ${url}: ${errText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Sends a plain text WhatsApp message.
   */
  async sendText(instanceName: string, toPhone: string, text: string): Promise<any> {
    const number = this.cleanPhone(toPhone);
    return this.request(`/message/sendText/${instanceName}`, {
      number,
      text,
      delay: 1200,
      linkPreview: true,
    });
  }

  /**
   * Sends an image or document message.
   */
  async sendMedia(
    instanceName: string,
    toPhone: string,
    mediaUrl: string,
    caption?: string,
    mediaType: 'image' | 'document' = 'image'
  ): Promise<any> {
    const number = this.cleanPhone(toPhone);
    return this.request(`/message/sendMedia/${instanceName}`, {
      number,
      media: mediaUrl,
      mediatype: mediaType,
      caption: caption || '',
      delay: 1000,
    });
  }

  /**
   * Sends an interactive button message (up to 3 buttons).
   */
  async sendButtons(
    instanceName: string,
    toPhone: string,
    title: string,
    description: string,
    buttons: EvolutionButton[]
  ): Promise<any> {
    const number = this.cleanPhone(toPhone);
    return this.request(`/message/sendButtons/${instanceName}`, {
      number,
      buttonMessage: {
        title,
        description,
        buttons: buttons.map((b) => ({
          buttonId: b.id,
          buttonText: { displayText: b.title },
          type: 1,
        })),
      },
    });
  }
}
