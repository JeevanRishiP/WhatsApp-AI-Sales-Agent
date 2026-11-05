import { type FastifyRequest, type FastifyReply } from 'fastify';
import { CustomerAuthService, type CustomerTokenPayload } from '../services/customer-auth-service.js';

declare module 'fastify' {
  interface FastifyRequest {
    customerSession?: CustomerTokenPayload;
  }
}

/**
 * Middleware that requires a verified customer session (via Bearer token or Cookie).
 */
export async function requireCustomerAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  let token: string | undefined;

  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (request.headers.cookie) {
    const cookies = request.headers.cookie.split(';');
    for (const cookie of cookies) {
      const [name, val] = cookie.trim().split('=');
      if (name === 'wcos_customer_token' && val) {
        token = decodeURIComponent(val);
        break;
      }
    }
  }

  if (!token) {
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Authentication required. Please sign in via WhatsApp OTP.',
    });
    return;
  }

  try {
    const payload = await CustomerAuthService.verifySession(token);
    request.customerSession = payload;
  } catch (err: any) {
    reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or expired session. Please sign in again.',
    });
  }
}

/**
 * Optional customer authentication: populates request.customerSession if token is valid,
 * but allows the request to continue as guest if absent.
 */
export async function optionalCustomerAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  let token: string | undefined;

  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (request.headers.cookie) {
    const cookies = request.headers.cookie.split(';');
    for (const cookie of cookies) {
      const [name, val] = cookie.trim().split('=');
      if (name === 'wcos_customer_token' && val) {
        token = decodeURIComponent(val);
        break;
      }
    }
  }

  if (token) {
    try {
      const payload = await CustomerAuthService.verifySession(token);
      request.customerSession = payload;
    } catch {
      // Ignore invalid guest token
    }
  }
}

