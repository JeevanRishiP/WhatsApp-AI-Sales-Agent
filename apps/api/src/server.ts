import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import rawBody from 'fastify-raw-body';
import { prisma } from '@wcos/db';
import { closeAllQueues, closeRedisConnection, getRedisCacheConnection } from '@wcos/queue';
import { config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { evolutionWebhookRoutes } from './routes/webhooks/evolution.js';
import { metaWebhookRoutes } from './routes/webhooks/meta.js';
import { razorpayWebhookRoutes } from './routes/webhooks/razorpay.js';
import { phonePeWebhookRoutes } from './routes/webhooks/phonepe.js';
import { checkoutPaymentRoutes } from './routes/payments/checkout.js';
import { phonePeCheckoutRoutes } from './routes/payments/phonepe-checkout.js';
import { tenantAdminRoutes } from './routes/admin/tenants.js';
import { productAdminRoutes } from './routes/admin/products.js';
import { customerAuthRoutes } from './routes/customer/auth.js';
import { customerStorefrontRoutes } from './routes/customer/storefront.js';
import { customerCartRoutes } from './routes/customer/cart.js';
import { customerOrdersRoutes } from './routes/customer/orders.js';
import { customerAddressesRoutes } from './routes/customer/addresses.js';

// Short-lived cache of active tenant custom domains for CORS validation
let customDomainCache: { origins: Set<string>; expiresAt: number } = {
  origins: new Set(),
  expiresAt: 0,
};

async function isAllowedOrigin(origin: string | undefined): Promise<boolean> {
  // Non-browser / server-to-server requests (webhooks, curl) have no Origin header
  if (!origin) return true;

  const normalized = origin.trim().replace(/\/+$/, '');
  if (config.ALLOWED_ORIGINS.includes(normalized)) {
    return true;
  }

  let hostname: string;
  try {
    hostname = new URL(normalized).hostname.toLowerCase();
  } catch {
    return false;
  }

  const now = Date.now();
  if (now > customDomainCache.expiresAt) {
    try {
      const tenants = await prisma.tenant.findMany({
        where: { status: 'ACTIVE', customDomain: { not: null } },
        select: { customDomain: true },
      });
      customDomainCache = {
        origins: new Set(
          tenants
            .map((t) => t.customDomain?.trim().toLowerCase())
            .filter((d): d is string => Boolean(d))
        ),
        expiresAt: now + 60_000,
      };
    } catch {
      // Retain existing cache if DB query fails briefly
    }
  }

  return customDomainCache.origins.has(hostname);
}

export async function buildServer(): Promise<FastifyInstance> {
  const resolvedTrustProxy =
    typeof config.TRUST_PROXY === 'number'
      ? (_address: string, hop: number) => hop <= (config.TRUST_PROXY as number)
      : config.TRUST_PROXY;

  const server = Fastify({
    trustProxy: resolvedTrustProxy,
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
    disableRequestLogging: config.NODE_ENV === 'production',
  });

  // 1. Security & Network Plugins
  await server.register(helmet, {
    contentSecurityPolicy: false, // API only
  });

  await server.register(cors, {
    origin: (origin, cb) => {
      isAllowedOrigin(origin)
        .then((allowed) => cb(allowed ? null : new Error('Origin not allowed by CORS'), allowed))
        .catch(() => cb(new Error('CORS validation error'), false));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-slug', 'x-guest-session-id', 'x-api-key', 'Cookie'],
    exposedHeaders: ['Set-Cookie'],
  });

  await server.register(rateLimit, {
    redis: getRedisCacheConnection(),
    max: config.NODE_ENV === 'production' ? 200 : 1000,
    timeWindow: '1 minute',
    allowList: config.NODE_ENV === 'production' ? [] : ['127.0.0.1', '::1', 'localhost'],
  });

  // 2. Raw Body Plugin (essential for HMAC signature verification)
  await server.register(rawBody, {
    field: 'rawBody',
    global: false,
    encoding: 'utf8',
    runFirst: true,
    routes: [
      '/webhooks/evolution/:tenantId',
      '/webhooks/meta/:tenantId',
      '/webhooks/razorpay/:tenantId',
      '/webhooks/phonepe/:tenantId',
      '/admin/tenants/:tenantId/products/import-csv',
    ],
  });

  // 3. Register Routes
  await server.register(healthRoutes);
  await server.register(evolutionWebhookRoutes);
  await server.register(metaWebhookRoutes);
  await server.register(razorpayWebhookRoutes);
  await server.register(phonePeWebhookRoutes);
  if (config.NODE_ENV !== 'production' && config.ENABLE_PAYMENT_SIMULATOR) {
    await server.register(checkoutPaymentRoutes);
    await server.register(phonePeCheckoutRoutes);
  } else {
    server.log.info('Payment sandbox simulator routes disabled');
  }
  await server.register(tenantAdminRoutes);
  await server.register(productAdminRoutes);
  await server.register(customerAuthRoutes);
  await server.register(customerStorefrontRoutes);
  await server.register(customerCartRoutes);
  await server.register(customerOrdersRoutes);
  await server.register(customerAddressesRoutes);

  // 4. Global Error Handler
  server.setErrorHandler((error: FastifyError, request, reply) => {
    server.log.error(
      {
        err: error,
        url: request.raw.url,
        method: request.raw.method,
      },
      'Unhandled API Exception'
    );

    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      statusCode,
      error: error.name || 'InternalServerError',
      message:
        config.NODE_ENV === 'production' && statusCode === 500
          ? 'An unexpected error occurred'
          : error.message,
    });
  });

  // 5. Graceful Shutdown
  const gracefulShutdown = async (signal: string) => {
    server.log.info(`Received ${signal}. Shutting down gracefully...`);
    try {
      await server.close();
      await closeAllQueues();
      await closeRedisConnection();
      await prisma.$disconnect();
      server.log.info('All connections cleanly terminated.');
      process.exit(0);
    } catch (err) {
      server.log.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  return server;
}
