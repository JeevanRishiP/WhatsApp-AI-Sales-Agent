import { type FastifyPluginAsync } from 'fastify';
import { prisma } from '@wcos/db';
import { getRedisConnection } from '@wcos/queue';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (_request, reply) => {
    const started = Date.now();
    let dbStatus = 'down';
    let redisStatus = 'down';

    // 1. Check PostgreSQL
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'up';
    } catch (err: any) {
      fastify.log.error({ err }, 'PostgreSQL health check failed');
    }

    // 2. Check Redis
    try {
      const redis = getRedisConnection();
      const pong = await redis.ping();
      if (pong === 'PONG') {
        redisStatus = 'up';
      }
    } catch (err: any) {
      fastify.log.error({ err }, 'Redis health check failed');
    }

    const isHealthy = dbStatus === 'up' && redisStatus === 'up';
    const statusCode = isHealthy ? 200 : 503;

    return reply.status(statusCode).send({
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - started,
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
      memoryUsageMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });
};
