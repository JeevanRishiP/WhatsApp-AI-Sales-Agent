import { type FastifyRequest, type FastifyReply } from 'fastify';
import { timingSafeCompare } from '@wcos/crypto';
import { config } from '../config.js';

/**
 * Validates that the request has a valid Admin API key.
 */
export async function requireAdminAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  const adminKeyHeader = request.headers['x-admin-key'] as string | undefined;

  let providedKey: string | undefined;

  if (adminKeyHeader) {
    providedKey = adminKeyHeader;
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    providedKey = authHeader.slice(7).trim();
  }

  if (!providedKey || !timingSafeCompare(providedKey, config.ADMIN_API_KEY)) {
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or missing admin credentials',
    });
  }
}
