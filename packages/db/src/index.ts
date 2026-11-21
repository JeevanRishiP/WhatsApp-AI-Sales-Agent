/**
 * @wcos/db — Database package
 *
 * Re-exports the Prisma 7 client, namespaces, and all generated model & enum types.
 */

export { prisma, withTenantContext, type PrismaClient } from './client.js';
export { Prisma } from './generated/prisma/client.js';
export {
  TenantStatus,
  TenantPlan,
  ProductStatus,
  OrderStatus,
  PaymentMethod,
  ReservationStatus,
  ConversationStage,
  OutboxStatus,
} from './generated/prisma/client.js';
export type {
  Tenant,
  Product,
  Order,
  OrderItem,
  InventoryReservation,
  Conversation,
  Message,
  CustomerMemory,
  PromptVersion,
  OutboxEvent,
  RawWebhookEvent,
  AuditLog,
} from './generated/prisma/client.js';
export * from './generated/prisma/client.js';
