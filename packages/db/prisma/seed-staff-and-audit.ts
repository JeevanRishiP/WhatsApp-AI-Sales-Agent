import { prisma } from '../src/client.js';

async function main() {
  console.log('🌱 Seeding Staff Users, Internal Notes & Immutable Audit Log...');

  const tenant = await prisma.tenant.findUnique({
    where: { id: '11111111-1111-4111-8111-111111111111' },
  });

  if (!tenant) {
    throw new Error('Tenant Aura Luxe Boutique (11111111-1111-4111-8111-111111111111) not found');
  }

  // 1. Seed Staff Users
  const staffMembers = [
    {
      fullName: 'Jeevan Rishi P',
      email: 'jeevan@auraluxe.com',
      phone: '9380990565',
      role: 'OWNER' as const,
      status: 'ACTIVE' as const,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    },
    {
      fullName: 'Ananya Rao',
      email: 'ananya@auraluxe.com',
      phone: '9845123456',
      role: 'STORE_MANAGER' as const,
      status: 'ACTIVE' as const,
      avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    },
    {
      fullName: 'Kavita Verma',
      email: 'kavita@auraluxe.com',
      phone: '9876543210',
      role: 'FULFILLMENT_LEAD' as const,
      status: 'ACTIVE' as const,
      avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    },
    {
      fullName: 'Meera Krishnan',
      email: 'meera@auraluxe.com',
      phone: '9741446186',
      role: 'SUPPORT_CONCIERGE' as const,
      status: 'ACTIVE' as const,
      avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    },
  ];

  const createdStaff: Record<string, any> = {};

  // Pre-hashed 12-round bcrypt hash for dev seed password: "staff123"
  const DEFAULT_STAFF_BCRYPT_HASH = '$2a$12$E3QiXImIMHU/bjo8qeOYW.rqPeI9m4OQYP0O7Ab5fgbelLiZ8xQMm';

  for (const s of staffMembers) {
    const staff = await prisma.staffUser.upsert({
      where: {
        tenantId_email: {
          tenantId: tenant.id,
          email: s.email,
        },
      },
      update: {
        fullName: s.fullName,
        phone: s.phone,
        passwordHash: DEFAULT_STAFF_BCRYPT_HASH,
        role: s.role,
        status: s.status,
        avatarUrl: s.avatarUrl,
        lastActiveAt: new Date(),
      },
      create: {
        tenantId: tenant.id,
        fullName: s.fullName,
        email: s.email,
        phone: s.phone,
        passwordHash: DEFAULT_STAFF_BCRYPT_HASH,
        role: s.role,
        status: s.status,
        avatarUrl: s.avatarUrl,
        lastLoginAt: new Date(),
        lastActiveAt: new Date(),
      },
    });
    createdStaff[s.role] = staff;
    console.log(`👤 Staff seeded: ${staff.fullName} [${staff.role}] (${staff.email})`);
  }

  // 2. Update Customer VIP Tiers and Tags
  const customers = await prisma.customer.findMany({
    where: { tenantId: tenant.id },
  });

  for (const c of customers) {
    await prisma.customer.update({
      where: { id: c.id },
      data: {
        vipTier: 'ROYAL',
        tags: ['VIP Collector', 'Pure Silk Patron', 'Fast Payer', 'Bridal Trousseau'],
        riskStatus: 'NORMAL',
      },
    });
    console.log(`✨ Updated Customer ${c.name || c.phone} to VIP Tier ROYAL`);
  }

  // 3. Find existing orders to attach notes, assignment & audit logs
  const orders = await prisma.order.findMany({
    where: { tenantId: tenant.id },
    include: { items: true },
    take: 5,
  });

  const firstOrder = orders[0];
  if (firstOrder) {
    const primaryOrder = firstOrder;
    const secondOrder = orders[1] || firstOrder;

    // Assign orders to staff
    await prisma.order.update({
      where: { id: primaryOrder.id },
      data: {
        assignedStaffId: createdStaff['FULFILLMENT_LEAD'].id,
        trackingNumber: 'BD-884920119-IN',
        trackingUrl: 'https://track.bluedart.com/?track=BD884920119IN',
      },
    });

    if (orders[1]) {
      await prisma.order.update({
        where: { id: secondOrder.id },
        data: {
          assignedStaffId: createdStaff['STORE_MANAGER'].id,
        },
      });
    }

    // 4. Seed Threaded Internal Notes
    await prisma.orderInternalNote.deleteMany({
      where: { tenantId: tenant.id },
    });

    await prisma.orderInternalNote.createMany({
      data: [
        {
          tenantId: tenant.id,
          orderId: primaryOrder.id,
          staffId: createdStaff['SUPPORT_CONCIERGE'].id,
          staffName: createdStaff['SUPPORT_CONCIERGE'].fullName,
          content: 'Customer confirmed on WhatsApp that delivery between 2 PM - 6 PM is preferred. Requested complimentary gold gift box with handwritten greeting card.',
          isPinned: true,
          createdAt: new Date(Date.now() - 3600 * 1000 * 4),
        },
        {
          tenantId: tenant.id,
          orderId: primaryOrder.id,
          staffId: createdStaff['FULFILLMENT_LEAD'].id,
          staffName: createdStaff['FULFILLMENT_LEAD'].fullName,
          content: 'Zari and silk fabric QC passed with zero defects. Packed with moisture-proof velvet casing and dispatched with Bluedart Express.',
          isPinned: false,
          createdAt: new Date(Date.now() - 3600 * 1000 * 2),
        },
        {
          tenantId: tenant.id,
          orderId: secondOrder.id,
          staffId: createdStaff['STORE_MANAGER'].id,
          staffName: createdStaff['STORE_MANAGER'].fullName,
          content: 'Priority handling authorized by Store Manager. Customer is celebrating wedding anniversary on Saturday.',
          isPinned: true,
          createdAt: new Date(Date.now() - 3600 * 1000 * 5),
        },
      ],
    });
    console.log(`📝 Seeded internal notes for orders`);

    // 5. Seed Tamper-Proof Audit Revision Logs
    await prisma.dataRevisionLog.deleteMany({
      where: { tenantId: tenant.id },
    });

    await prisma.dataRevisionLog.createMany({
      data: [
        {
          tenantId: tenant.id,
          entityType: 'ORDER',
          entityId: primaryOrder.id,
          action: 'STATUS_CHANGE',
          staffId: createdStaff['STORE_MANAGER'].id,
          staffName: createdStaff['STORE_MANAGER'].fullName,
          staffRole: 'STORE_MANAGER',
          actorType: 'STAFF',
          reason: 'Verified PhonePe payment transaction online and approved order for immediate packaging.',
          beforeSnapshot: { status: 'PENDING_PAYMENT', orderNumber: primaryOrder.orderNumber },
          afterSnapshot: { status: 'PROCESSING', orderNumber: primaryOrder.orderNumber },
          diffSummary: { status: { from: 'PENDING_PAYMENT', to: 'PROCESSING' } },
          ipAddress: '103.212.145.22',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          timestamp: new Date(Date.now() - 3600 * 1000 * 6),
        },
        {
          tenantId: tenant.id,
          entityType: 'CUSTOMER_ADDRESS',
          entityId: primaryOrder.id,
          action: 'ADDRESS_UPDATE',
          staffId: createdStaff['SUPPORT_CONCIERGE'].id,
          staffName: createdStaff['SUPPORT_CONCIERGE'].fullName,
          staffRole: 'SUPPORT_CONCIERGE',
          actorType: 'STAFF',
          reason: 'Customer reached out via WhatsApp voice note requesting delivery to their corporate office address prior to dispatch.',
          beforeSnapshot: { line1: 'Shivaganga Nilaya, 1st cross, Janatha Colony' },
          afterSnapshot: { line1: 'Prestige Tech Park, Block C, 4th Floor, Marathahalli' },
          diffSummary: {
            line1: {
              from: 'Shivaganga Nilaya, 1st cross, Janatha Colony',
              to: 'Prestige Tech Park, Block C, 4th Floor, Marathahalli',
            },
          },
          ipAddress: '103.212.145.22',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          timestamp: new Date(Date.now() - 3600 * 1000 * 4),
        },
        {
          tenantId: tenant.id,
          entityType: 'ORDER',
          entityId: primaryOrder.id,
          action: 'TRACKING_UPDATE',
          staffId: createdStaff['FULFILLMENT_LEAD'].id,
          staffName: createdStaff['FULFILLMENT_LEAD'].fullName,
          staffRole: 'FULFILLMENT_LEAD',
          actorType: 'STAFF',
          reason: 'Parcel boxed in gold foil packaging, handed over to Bluedart courier pickup agent.',
          beforeSnapshot: { status: 'PROCESSING', trackingNumber: null },
          afterSnapshot: {
            status: 'SHIPPED',
            trackingNumber: 'BD-884920119-IN',
            courier: 'Bluedart Express',
          },
          diffSummary: {
            status: { from: 'PROCESSING', to: 'SHIPPED' },
            trackingNumber: { from: null, to: 'BD-884920119-IN' },
          },
          ipAddress: '103.212.145.22',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          timestamp: new Date(Date.now() - 3600 * 1000 * 2),
        },
        {
          tenantId: tenant.id,
          entityType: 'CUSTOMER',
          entityId: customers[0]?.id || primaryOrder.id,
          action: 'CUSTOMER_FLAGGED',
          staffId: createdStaff['OWNER'].id,
          staffName: createdStaff['OWNER'].fullName,
          staffRole: 'OWNER',
          actorType: 'STAFF',
          reason: 'Conferred Royal VIP tier status due to high lifetime spend and zero returns.',
          beforeSnapshot: { vipTier: 'STANDARD', tags: [] },
          afterSnapshot: { vipTier: 'ROYAL', tags: ['VIP Collector', 'Pure Silk Patron'] },
          diffSummary: {
            vipTier: { from: 'STANDARD', to: 'ROYAL' },
            tags: { from: [], to: ['VIP Collector', 'Pure Silk Patron'] },
          },
          ipAddress: '103.212.145.10',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          timestamp: new Date(Date.now() - 3600 * 1000 * 1),
        },
      ],
    });
    console.log(`🛡️ Seeded tamper-proof DataRevisionLog entries`);
  }

  console.log('✅ Staff and audit seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
