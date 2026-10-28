import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('🌱 Seeding WhatsApp Commerce OS database...');

  const dataPath = path.join(__dirname, 'seeds', 'sample-data.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Seed data file not found at ${dataPath}`);
  }

  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const data = JSON.parse(rawData);

  // 1. Seed Tenants
  console.log(`🏢 Seeding ${data.tenants.length} tenants...`);
  for (const t of data.tenants) {
    await prisma.tenant.upsert({
      where: { apiKey: t.apiKey },
      update: {
        name: t.name,
        ownerName: t.ownerName,
        ownerPhone: t.ownerPhone,
        ownerEmail: t.ownerEmail,
        businessCategory: t.businessCategory,
        status: t.status,
        plan: t.plan,
        whatsappInstanceName: t.whatsappInstanceName,
        persona: t.persona,
        monthlyMessageCount: t.monthlyMessageCount,
        monthlyMessageLimit: t.monthlyMessageLimit,
      },
      create: {
        id: t.id,
        name: t.name,
        ownerName: t.ownerName,
        ownerPhone: t.ownerPhone,
        ownerEmail: t.ownerEmail,
        businessCategory: t.businessCategory,
        status: t.status,
        plan: t.plan,
        apiKey: t.apiKey,
        whatsappInstanceName: t.whatsappInstanceName,
        persona: t.persona,
        monthlyMessageCount: t.monthlyMessageCount,
        monthlyMessageLimit: t.monthlyMessageLimit,
      },
    });
  }

  // 2. Seed Products
  console.log(`🛍️ Seeding ${data.products.length} products...`);
  for (const p of data.products) {
    await prisma.product.upsert({
      where: {
        tenantId_code: { tenantId: p.tenantId, code: p.code },
      },
      update: {
        name: p.name,
        description: p.description,
        category: p.category,
        subcategory: p.subcategory,
        price: p.price,
        salePrice: p.salePrice,
        currency: 'INR',
        stock: p.stock,
        lowStockThreshold: p.lowStockThreshold,
        attributes: p.attributes,
        tags: p.tags,
        status: p.stock > 0 ? 'ACTIVE' : 'OUT_OF_STOCK',
        searchText: p.searchText,
        embeddingText: p.embeddingText,
        imageUrls: p.imageUrls,
      },
      create: {
        id: p.id,
        tenantId: p.tenantId,
        code: p.code,
        name: p.name,
        description: p.description,
        category: p.category,
        subcategory: p.subcategory,
        price: p.price,
        salePrice: p.salePrice,
        currency: 'INR',
        stock: p.stock,
        lowStockThreshold: p.lowStockThreshold,
        attributes: p.attributes,
        tags: p.tags,
        status: p.stock > 0 ? 'ACTIVE' : 'OUT_OF_STOCK',
        searchText: p.searchText,
        embeddingText: p.embeddingText,
        imageUrls: p.imageUrls,
      },
    });
  }

  // 3. Seed Customer Memories
  console.log(`👤 Seeding ${data.customers.length} customer profiles...`);
  for (const c of data.customers) {
    await prisma.customerMemory.upsert({
      where: {
        tenantId_customerPhone: {
          tenantId: c.tenantId,
          customerPhone: c.customerPhone,
        },
      },
      update: {
        customerName: c.customerName,
        preferredCategories: c.preferredCategories,
        preferredAttributes: c.preferredAttributes,
        budgetRange: c.budgetRange,
        totalOrders: c.totalOrders,
        totalSpent: c.totalSpent,
        averageOrderValue: c.averageOrderValue,
        isRepeatCustomer: c.isRepeatCustomer,
        preferredLanguage: c.preferredLanguage,
        totalMessages: c.totalMessages,
      },
      create: {
        id: c.id,
        tenantId: c.tenantId,
        customerPhone: c.customerPhone,
        customerName: c.customerName,
        preferredCategories: c.preferredCategories,
        preferredAttributes: c.preferredAttributes,
        budgetRange: c.budgetRange,
        totalOrders: c.totalOrders,
        totalSpent: c.totalSpent,
        averageOrderValue: c.averageOrderValue,
        isRepeatCustomer: c.isRepeatCustomer,
        preferredLanguage: c.preferredLanguage,
        totalMessages: c.totalMessages,
      },
    });
  }

  // 4. Seed Inventory Reservations
  if (data.inventoryReservations?.length) {
    console.log(`📦 Seeding ${data.inventoryReservations.length} inventory reservations...`);
    for (const r of data.inventoryReservations) {
      await prisma.inventoryReservation.upsert({
        where: { id: r.id },
        update: {
          items: {
            productId: r.productId,
            customerPhone: r.customerPhone,
            quantity: r.quantity,
          },
          status: r.status,
          expiresAt: new Date(r.expiresAt),
        },
        create: {
          id: r.id,
          tenantId: r.tenantId,
          items: {
            productId: r.productId,
            customerPhone: r.customerPhone,
            quantity: r.quantity,
          },
          status: r.status,
          createdAt: r.reservedAt ? new Date(r.reservedAt) : new Date(),
          expiresAt: new Date(r.expiresAt),
        },
      });
    }
  }

  // 5. Seed Orders & OrderItems
  console.log(`🧾 Seeding ${data.orders.length} orders...`);
  for (const o of data.orders) {
    // Delete existing items for order if upserting
    await prisma.orderItem.deleteMany({
      where: { orderId: o.id },
    }).catch(() => {});

    await prisma.order.upsert({
      where: {
        tenantId_orderNumber: {
          tenantId: o.tenantId,
          orderNumber: o.orderNumber,
        },
      },
      update: {
        customerPhone: o.customerPhone,
        customerName: o.customerName,
        subtotal: o.subtotal,
        discount: o.discount || 0,
        shippingCharge: o.shippingCharge || 0,
        total: o.total,
        paymentMethod: o.paymentMethod,
        deliveryAddress: o.deliveryAddress,
        status: o.status,
        statusHistory: o.statusHistory || [],
      },
      create: {
        id: o.id,
        tenantId: o.tenantId,
        orderNumber: o.orderNumber,
        customerPhone: o.customerPhone,
        customerName: o.customerName,
        subtotal: o.subtotal,
        discount: o.discount || 0,
        shippingCharge: o.shippingCharge || 0,
        total: o.total,
        paymentMethod: o.paymentMethod,
        deliveryAddress: o.deliveryAddress,
        status: o.status,
        statusHistory: o.statusHistory || [],
        items: {
          create: o.items.map((item: any) => ({
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            quantity: item.quantity,
            priceAtOrder: item.priceAtOrder,
            totalAtOrder: item.totalAtOrder,
          })),
        },
      },
    });
  }

  // 6. Seed Conversations & Messages
  console.log(`💬 Seeding ${data.conversations.length} WhatsApp conversations...`);
  for (const conv of data.conversations) {
    const stageMap: Record<string, string> = {
      ADD_TO_CART: 'CART_ACTIVE',
      NEGOTIATION: 'BROWSING',
      CHECKOUT: 'CHECKOUT_CONFIRM',
    };
    const stage = stageMap[conv.stage] || conv.stage || 'GREETING';

    const conversation = await prisma.conversation.upsert({
      where: {
        tenantId_customerPhone: {
          tenantId: conv.tenantId,
          customerPhone: conv.customerPhone,
        },
      },
      update: {
        stage: stage as any,
        messageCount: conv.messages.length,
        lastMessageAt: new Date(),
      },
      create: {
        id: conv.conversationId,
        tenantId: conv.tenantId,
        customerPhone: conv.customerPhone,
        stage: stage as any,
        messageCount: conv.messages.length,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Clear previous seed messages for clean run
    await prisma.message.deleteMany({
      where: { conversationId: conversation.id },
    }).catch(() => {});

    for (const msg of conv.messages) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          tenantId: conv.tenantId,
          role: msg.role,
          content: msg.content,
          messageType: msg.messageType || 'text',
          intent: msg.intent,
          actionTaken: msg.actionTaken,
          latencyMs: msg.latencyMs || 0,
        },
      });
    }
  }

  console.log('✨ All database tables successfully seeded!');
}

main()
  .catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
