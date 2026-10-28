/**
 * @wcos/db — Database package
 *
 * Re-exports the Prisma client, namespaces, and all generated model & enum types.
 */

export { prisma, type PrismaClient } from './client.js';
export { Prisma } from '@prisma/client';
export {
  TenantStatus,
  TenantPlan,
  ProductStatus,
  OrderStatus,
  PaymentMethod,
  ReservationStatus,
  ConversationStage,
  OutboxStatus,
} from '@prisma/client';
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
} from '@prisma/client';
export * from '@prisma/client';
