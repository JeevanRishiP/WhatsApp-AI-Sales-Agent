import { prisma } from '@wcos/db';
import { aiGateway } from '@wcos/ai';

async function main() {
  const userQuery = process.argv[2] || 'Namaste! Do you have any bridal Kanjeevaram sarees in red?';
  const customerPhone = '+919999999999';

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🤖 WhatsApp Commerce OS — Interactive AI Simulation');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`👤 Customer: ${customerPhone}`);
  console.log(`💬 Message: "${userQuery}"\n`);

  // 1. Fetch or fallback tenant
  let tenant: any = null;
  try {
    tenant = await prisma.tenant.findFirst({
      where: {
        OR: [
          { whatsappInstanceName: 'wa_aura_luxe_01' },
          { status: 'ACTIVE' },
        ],
      },
    });
  } catch {
    // Database not running or DATABASE_URL not set
  }

  if (!tenant) {
    tenant = {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Aarohi Silk Sarees',
      ownerName: 'Aarohi Sharma',
      ownerPhone: '+919876543210',
      ownerEmail: 'contact@aarohisilks.com',
      businessCategory: 'Sarees',
      whatsappInstanceName: 'aarohi-silks',
      status: 'ACTIVE',
      plan: 'GROWTH',
      apiKey: 'test-api-key',
      evolutionInstanceId: null,
      razorpayAccountId: null,
      monthlyMessageCount: 0,
      monthlyMessageLimit: 1000,
      createdAt: new Date(),
      updatedAt: new Date(),
      persona: {
        botName: 'Aarohi Sales Assistant',
        tone: 'friendly',
        language: 'en',
        customRules: ['Always greet with Namaste 🙏'],
      },
    } as any;
  }

  // 2. Fetch products
  let products: any[] = [];
  try {
    products = await prisma.product.findMany({
      where: { tenantId: tenant!.id, status: 'ACTIVE' },
      take: 5,
    });
  } catch {
    // Database not running or DATABASE_URL not set
  }

  if (products.length === 0) {
    products = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        tenantId: tenant!.id,
        code: 'KANJ-001',
        name: 'Pure Kanjeevaram Silk Saree - Crimson Red & Gold Zari',
        description: 'Handwoven pure mulberry silk with rich contrast korvai border.',
        category: 'Kanjeevaram',
        subcategory: 'Bridal Silk',
        price: 6999 as any,
        salePrice: 6499 as any,
        currency: 'INR',
        stock: 10,
        reserved: 0,
        lowStockThreshold: 2,
        imageUrls: [],
        thumbnailUrl: null,
        attributes: { fabric: 'Pure Silk', zari: 'Gold' },
        tags: ['kanjeevaram', 'bridal', 'red'],
        status: 'ACTIVE',
        searchText: null,
        embeddingText: null,
        weight: null,
        dimensions: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    ];
  }

  // 3. Standalone Memory Cart for simulation
  const cart: any = {
    id: 'cart-1',
    tenantId: tenant!.id,
    customerPhone,
    items: [],
    subtotal: 0,
    currency: 'INR',
    itemCount: 0,
    createdAt: new Date(),
    lastActivityAt: new Date(),
    expiresAt: new Date(),
  };

  // 4. Run AI Inference
  console.log('🧠 Generating AI response with fallback support...');
  const persona = (tenant!.persona || {}) as Record<string, any>;
  const result = await aiGateway.processMessage({
    context: {
      agentName: persona['botName'] || 'Aarohi',
      storeName: tenant!.name,
      currency: 'INR',
      currentStage: 'GREETING',
      customerName: 'Priya',
      cartSummary: {
        itemsCount: cart.itemCount,
        subtotal: cart.subtotal,
        items: cart.items.map((i: any) => ({
          name: i.productName,
          quantity: i.quantity,
          price: i.priceAtAdd,
        })),
      },
      catalogContext: products
        .map(
          (p) =>
            `- [Code: ${p.code}] *${p.name}* | Price: ₹${Number(p.salePrice || p.price)} | Stock: ${p.stock - p.reserved} available\n  ${p.description || ''}`
        )
        .join('\n'),
    },
    currentMessage: userQuery,
    history: [],
    tier: 'fast',
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`🤖 Model: ${result.telemetry.modelName} (${result.telemetry.provider}) [${result.telemetry.durationMs}ms]`);
  console.log(`🎯 Identified Intent: ${result.response.intent}`);
  console.log(`⚡ Action: ${result.response.action.action}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n💬 WhatsApp Reply to Customer:\n');
  console.log(result.response.message || result.response.action.reply);
  console.log('\n═══════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('Simulation error:', err);
  process.exit(1);
});
