import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import rawBody from 'fastify-raw-body';
import { prisma } from '@wcos/db';
import { closeAllQueues, closeRedisConnection } from '@wcos/queue';
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

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    trustProxy: true,
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
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  await server.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
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
  await server.register(checkoutPaymentRoutes);
  await server.register(phonePeCheckoutRoutes);
  await server.register(tenantAdminRoutes);
  await server.register(productAdminRoutes);

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
