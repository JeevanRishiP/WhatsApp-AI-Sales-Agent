import { type FastifyPluginAsync } from 'fastify';
import { CustomerAuthService } from '../../services/customer-auth-service.js';
import { requireCustomerAuth } from '../../middleware/customer-auth.js';
import { prisma } from '@wcos/db';
import { config } from '../../config.js';

function buildCustomerCookie(token: string, maxAgeSeconds: number): string {
  const securePart = config.NODE_ENV === 'production' ? '; Secure' : '';
  return `wcos_customer_token=${token}; Path=/; HttpOnly; SameSite=Lax${securePart}; Max-Age=${maxAgeSeconds}`;
}

export const customerAuthRoutes: FastifyPluginAsync = async (server) => {
  /**
   * Dispatches an OTP to the customer's WhatsApp.
   */
  server.post<{
    Body: { tenantSlug: string; phone: string };
  }>(
    '/api/v1/customer/auth/send-otp',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { tenantSlug, phone } = request.body || {};
      if (!tenantSlug || !phone) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'BadRequest',
          message: 'tenantSlug and phone are required',
        });
      }

      try {
        const result = await CustomerAuthService.sendOtp(tenantSlug, phone);
        return reply.send(result);
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'OtpSendError',
          message: err.message,
        });
      }
    }
  );

  /**
   * Verifies the WhatsApp OTP and sets a secure customer session.
   */
  server.post<{
    Body: { tenantSlug: string; phone: string; code: string };
  }>(
    '/api/v1/customer/auth/verify-otp',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { tenantSlug, phone, code } = request.body || {};
      if (!tenantSlug || !phone || !code) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'BadRequest',
          message: 'tenantSlug, phone, and 6-digit code are required',
        });
      }

      try {
        const { customer, token, expiresIn } = await CustomerAuthService.verifyOtp(
          tenantSlug,
          phone,
          code
        );

        reply.header('Set-Cookie', buildCustomerCookie(token, expiresIn));

        return reply.send({
          customer,
          token,
          expiresIn,
        });
      } catch (err: any) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'VerificationFailed',
          message: err.message,
        });
      }
    }
  );

  /**
   * Single-use magic link authentication from WhatsApp conversation.
   */
  server.get<{
    Querystring: { token: string };
  }>('/api/v1/customer/auth/magic', async (request, reply) => {
    const { token } = request.query;
    if (!token) {
      return reply.status(400).send({ error: 'Token is required' });
    }

    try {
      const {
        customer,
        token: sessionToken,
        redirectPath,
      } = await CustomerAuthService.resolveMagicLinkToken(token);

      reply.header('Set-Cookie', buildCustomerCookie(sessionToken, 30 * 24 * 3600));

      return reply.send({
        customer,
        token: sessionToken,
        redirectPath,
      });
    } catch (err: any) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'InvalidMagicLink',
        message: err.message,
      });
    }
  });

  /**
   * Returns current authenticated customer profile and saved delivery addresses.
   */
  server.get(
    '/api/v1/customer/auth/me',
    { preHandler: [requireCustomerAuth] },
    async (request, reply) => {
      const session = request.customerSession!;
      const customer = await prisma.customer.findUnique({
        where: { id: session.customerId },
        include: {
          addresses: {
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
          },
        },
      });

      if (!customer) {
        return reply.status(404).send({ error: 'Customer not found' });
      }

      return reply.send({ customer });
    }
  );

  /**
   * Logs out the customer and clears the session cookie.
   */
  server.post('/api/v1/customer/auth/logout', async (_request, reply) => {
    reply.header('Set-Cookie', buildCustomerCookie('', 0));
    return reply.send({ success: true, message: 'Logged out successfully' });
  });
};
