import { type FastifyRequest, type FastifyReply } from 'fastify';
import { prisma } from '@wcos/db';
import { CustomerAuthService, type CustomerTokenPayload } from '../services/customer-auth-service.js';

declare module 'fastify' {
  interface FastifyRequest {
    customerSession?: CustomerTokenPayload;
  }
}

function extractCustomerToken(request: FastifyRequest): string | undefined {
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (request.headers.cookie) {
    const cookies = request.headers.cookie.split(';');
    for (const cookie of cookies) {
      const eqIdx = cookie.indexOf('=');
      if (eqIdx === -1) continue;
      const name = cookie.slice(0, eqIdx).trim();
      const val = cookie.slice(eqIdx + 1).trim();
      if (name === 'wcos_customer_token' && val) {
        return decodeURIComponent(val);
      }
    }
  }
  return undefined;
}

async function verifyActiveCustomerSession(token: string): Promise<CustomerTokenPayload> {
  const payload = await CustomerAuthService.verifySession(token);
  const customer = await prisma.customer.findUnique({
    where: { id: payload.customerId },
    select: {
      tenantId: true,
      riskStatus: true,
      tenant: { select: { status: true } },
    },
  });

  if (
    !customer ||
    customer.tenantId !== payload.tenantId ||
    customer.riskStatus === 'BLOCKED' ||
    customer.tenant.status !== 'ACTIVE'
  ) {
    throw new Error('Customer session revoked or store inactive');
  }

  return payload;
}

/**
 * Middleware requiring a verified active customer session on an active tenant.
 */
export async function requireCustomerAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = extractCustomerToken(request);
  if (!token) {
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Authentication required. Please sign in via WhatsApp OTP.',
    });
    return;
  }

  try {
    request.customerSession = await verifyActiveCustomerSession(token);
  } catch {
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid, expired, or restricted session. Please sign in again.',
    });
  }
}

/**
 * Optional customer authentication: populates request.customerSession if token is valid & active,
 * otherwise allows request to proceed as guest.
 */
export async function optionalCustomerAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const token = extractCustomerToken(request);
  if (!token) return;

  try {
    request.customerSession = await verifyActiveCustomerSession(token);
  } catch {
    // Ignore invalid guest token
  }
}
