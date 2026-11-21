import { type FastifyPluginAsync } from 'fastify';
import { prisma } from '@wcos/db';
import { requireAdminAuth } from '../../middleware/auth.js';
import { CreateTenantSchema, UpdateTenantSchema } from '@wcos/types';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SAFE_TENANT_SELECT = {
  id: true,
  name: true,
  slug: true,
  ownerName: true,
  ownerPhone: true,
  ownerEmail: true,
  supportPhone: true,
  businessCategory: true,
  whatsappInstanceName: true,
  whatsappPhoneNumber: true,
  customDomain: true,
  plan: true,
  status: true,
  monthlyMessageCount: true,
  monthlyMessageLimit: true,
  persona: true,
  aiConfig: true,
  storefrontTheme: true,
  storePolicies: true,
  legalName: true,
  gstin: true,
  cin: true,
  warehouseAddress: true,
  defaultHsn: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const tenantAdminRoutes: FastifyPluginAsync = async (fastify) => {
  // Protect all tenant management routes with admin auth
  fastify.addHook('preHandler', requireAdminAuth);

  // POST /admin/tenants — Create new tenant
  fastify.post('/admin/tenants', async (request, reply) => {
    const parsed = CreateTenantSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.format(),
      });
    }

    const {
      name,
      ownerName,
      ownerPhone,
      ownerEmail,
      businessCategory,
      whatsappInstanceName,
      plan,
      persona,
    } = parsed.data;

    // Check instance name uniqueness
    const existing = await prisma.tenant.findFirst({
      where: { whatsappInstanceName },
      select: { id: true },
    });
    if (existing) {
      return reply.status(409).send({
        error: `Tenant with WhatsApp instance name '${whatsappInstanceName}' already exists`,
      });
    }

    const tenant = await prisma.tenant.create({
      data: {
        name,
        ownerName,
        ownerPhone,
        ownerEmail,
        businessCategory,
        whatsappInstanceName,
        plan,
        persona: persona ? (persona as any) : {},
      },
      select: SAFE_TENANT_SELECT,
    });

    return reply.status(201).send(tenant);
  });

  // GET /admin/tenants/:id — Get tenant
  fastify.get<{ Params: { id: string } }>('/admin/tenants/:id', async (request, reply) => {
    const { id } = request.params;
    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Invalid tenant ID' });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: {
        ...SAFE_TENANT_SELECT,
        promptVersions: {
          take: 5,
          orderBy: { version: 'desc' },
        },
      },
    });

    if (!tenant) {
      return reply.status(404).send({ error: 'Tenant not found' });
    }

    return reply.send(tenant);
  });

  // PATCH /admin/tenants/:id — Update tenant
  fastify.patch<{ Params: { id: string } }>('/admin/tenants/:id', async (request, reply) => {
    const { id } = request.params;
    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Invalid tenant ID' });
    }

    const parsed = UpdateTenantSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.format(),
      });
    }

    const updateData: any = { ...parsed.data };
    if (parsed.data.persona) {
      updateData.persona = parsed.data.persona;
    }

    const updated = await prisma.tenant.update({
      where: { id },
      data: updateData,
      select: SAFE_TENANT_SELECT,
    });

    return reply.send(updated);
  });
};
