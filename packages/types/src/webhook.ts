import { z } from 'zod';

/**
 * Evolution API webhook types
 *
 * Evolution API sends webhook events in a different format than Meta's
 * Cloud API. These schemas handle the Evolution-specific payload structure.
 *
 * @see https://doc.evolution-api.com/v2/api-reference/webhooks
 */

// ─── Incoming message types from Evolution API ────────────────────

export const EvolutionMessageTypeSchema = z.enum([
  'conversation',      // text message
  'imageMessage',      // image
  'audioMessage',      // voice note
  'videoMessage',      // video
  'documentMessage',   // file/document
  'stickerMessage',    // sticker
  'contactMessage',    // shared contact
  'locationMessage',   // shared location
  'reactionMessage',   // emoji reaction
  'listResponseMessage',      // list selection response
  'buttonsResponseMessage',   // button click response
]);

export type EvolutionMessageType = z.infer<typeof EvolutionMessageTypeSchema>;

// ─── Key info from the Evolution webhook ──────────────────────────

export const EvolutionKeySchema = z.object({
  remoteJid: z.string(),           // sender phone: "919876543210@s.whatsapp.net"
  fromMe: z.boolean(),             // true if sent by the bot
  id: z.string(),                  // unique message ID
});

export const EvolutionMessageSchema = z.object({
  key: EvolutionKeySchema,
  pushName: z.string().optional(),  // sender's WhatsApp display name
  message: z.record(z.unknown()).optional(),
  messageType: EvolutionMessageTypeSchema.optional(),
  messageTimestamp: z.number().optional(),
});

// ─── Evolution webhook event envelope ─────────────────────────────

export const EvolutionWebhookEventSchema = z.object({
  event: z.string(),                        // "messages.upsert", "messages.update", etc.
  instance: z.string(),                     // Evolution instance name
  data: z.union([
    EvolutionMessageSchema,
    z.array(EvolutionMessageSchema),
    z.record(z.unknown()),
  ]),
  destination: z.string().optional(),       // bot's phone number
  date_time: z.string().optional(),
  server_url: z.string().optional(),
  apikey: z.string().optional(),            // instance API key (for verification)
});

export type EvolutionWebhookEvent = z.infer<typeof EvolutionWebhookEventSchema>;
export type EvolutionMessage = z.infer<typeof EvolutionMessageSchema>;

// ─── Normalized internal message format ───────────────────────────
// Regardless of whether the source is Evolution or Meta,
// we normalize to this internal format for processing.

export const NormalizedMessageSchema = z.object({
  id: z.string(),                             // original message ID (for dedup)
  source: z.enum(['evolution', 'meta']),       // which API sent this
  instanceName: z.string(),                    // Evolution instance or Meta phone ID
  tenantId: z.string(),                        // resolved tenant
  customerPhone: z.string(),                   // normalized phone number (digits only)
  customerName: z.string().optional(),         // WhatsApp display name
  type: z.enum([
    'text', 'image', 'audio', 'video', 'document',
    'sticker', 'contact', 'location', 'reaction',
    'button_reply', 'list_reply',
  ]),
  text: z.string().optional(),                 // message text (if text type)
  mediaUrl: z.string().url().optional(),       // media URL (if media type)
  mediaMimeType: z.string().optional(),
  buttonPayload: z.string().optional(),        // button reply payload
  listPayload: z.string().optional(),          // list selection payload
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    name: z.string().optional(),
  }).optional(),
  timestamp: z.date(),
  rawPayload: z.record(z.unknown()),           // full original payload for audit
});

export type NormalizedMessage = z.infer<typeof NormalizedMessageSchema>;

// ─── Webhook verification types ───────────────────────────────────

export const WebhookVerificationSchema = z.object({
  'hub.mode': z.literal('subscribe'),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string(),
});

export type WebhookVerification = z.infer<typeof WebhookVerificationSchema>;
