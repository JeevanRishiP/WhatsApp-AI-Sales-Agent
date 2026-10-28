import { type FastifyPluginAsync } from 'fastify';
import { prisma } from '@wcos/db';
import { notifyOrderPaymentConfirmed } from '../../services/payment-notifications.js';

export const checkoutPaymentRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── 1. Hosted Sandbox Checkout Page ────────────────────────────
  fastify.get<{ Params: { orderId: string } }>(
    '/payments/checkout/:orderId',
    async (request, reply) => {
      const { orderId } = request.params;

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          tenant: {
            select: {
              name: true,
              ownerEmail: true,
              ownerPhone: true,
            },
          },
        },
      });

      if (!order) {
        return reply.status(404).type('text/html').send(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>Order Not Found — Razorpay Sandbox</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #1e293b; border: 1px solid #334155; padding: 32px; border-radius: 12px; max-width: 440px; text-align: center; }
                h1 { color: #ef4444; font-size: 1.25rem; margin-top: 0; }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>Order Not Found</h1>
                <p>This checkout session has expired or the order reference does not exist.</p>
              </div>
            </body>
          </html>
        `);
      }

      const isPaid = order.status === 'PAYMENT_CONFIRMED' || order.status === 'PROCESSING' || order.status === 'SHIPPED' || order.status === 'DELIVERED';

      // Detect customer platform from User-Agent and persist it for future gateway routing
      const ua = (request.headers['user-agent'] || '').toLowerCase();
      let detectedPlatform: string = 'web';
      if (/android/.test(ua)) detectedPlatform = 'android';
      else if (/iphone|ipad|ipod/.test(ua)) detectedPlatform = 'ios';
      else if (/mobile/.test(ua)) detectedPlatform = 'android';

      if (!isPaid) {
        // Store platform in conversation for future payment routing decisions
        const conversation = await prisma.conversation.findFirst({
          where: { tenantId: order.tenantId, customerPhone: order.customerPhone },
          select: { id: true, metadata: true },
        });
        if (conversation) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              metadata: {
                ...((conversation.metadata as object) || {}),
                customerPlatform: detectedPlatform,
              },
            },
          }).catch(() => {/* non-fatal */});
        }
      }

      const itemsListHtml = order.items
        .map(
          (it) => `
          <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #334155; font-size: 0.875rem;">
            <span>${it.productName} <strong style="color: #94a3b8;">x${it.quantity}</strong></span>
            <span style="font-weight: 600;">₹${Number(it.totalAtOrder).toFixed(2)}</span>
          </div>
        `
        )
        .join('');

      const html = `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Razorpay Sandbox Checkout — ${order.orderNumber}</title>
            <style>
              * { box-sizing: border-box; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: #090d16;
                color: #f1f5f9;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0;
                padding: 16px;
              }
              .checkout-card {
                background: #111827;
                border: 1px solid #1f2937;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
                border-radius: 16px;
                width: 100%;
                max-width: 460px;
                overflow: hidden;
              }
              .header {
                background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
                padding: 24px;
                color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: space-between;
              }
              .header-logo {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 700;
                font-size: 1.125rem;
                letter-spacing: -0.025em;
              }
              .sandbox-badge {
                background: rgba(255, 255, 255, 0.2);
                padding: 4px 10px;
                border-radius: 9999px;
                font-size: 0.6875rem;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                backdrop-filter: blur(4px);
              }
              .content {
                padding: 24px;
              }
              .merchant-info {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 20px;
                padding-bottom: 16px;
                border-bottom: 1px solid #1f2937;
              }
              .merchant-name {
                font-size: 1.125rem;
                font-weight: 600;
                color: #f8fafc;
              }
              .order-ref {
                font-size: 0.75rem;
                color: #94a3b8;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                margin-top: 2px;
              }
              .amount-display {
                text-align: right;
              }
              .amount-label {
                font-size: 0.75rem;
                color: #94a3b8;
                text-transform: uppercase;
              }
              .amount-val {
                font-size: 1.5rem;
                font-weight: 800;
                color: #38bdf8;
              }
              .items-box {
                background: #0f172a;
                border: 1px solid #1e293b;
                border-radius: 8px;
                padding: 12px 16px;
                margin-bottom: 20px;
              }
              .btn-action {
                display: block;
                width: 100%;
                padding: 14px;
                border: none;
                border-radius: 8px;
                font-weight: 600;
                font-size: 0.9375rem;
                cursor: pointer;
                transition: all 0.2s ease;
                margin-bottom: 10px;
                text-align: center;
                text-decoration: none;
              }
              .btn-upi {
                background: #22c55e;
                color: #ffffff;
              }
              .btn-upi:hover {
                background: #16a34a;
              }
              .btn-card {
                background: #3b82f6;
                color: #ffffff;
              }
              .btn-card:hover {
                background: #2563eb;
              }
              .btn-fail {
                background: #334155;
                color: #94a3b8;
                font-size: 0.8125rem;
                padding: 10px;
              }
              .btn-fail:hover {
                background: #475569;
                color: #cbd5e1;
              }
              .paid-state {
                text-align: center;
                padding: 24px 0;
              }
              .paid-icon {
                font-size: 3rem;
                margin-bottom: 12px;
              }
              .security-footer {
                margin-top: 20px;
                padding-top: 16px;
                border-top: 1px solid #1f2937;
                text-align: center;
                font-size: 0.75rem;
                color: #64748b;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
              }
            </style>
          </head>
          <body>
            <div class="checkout-card">
              <div class="header">
                <div class="header-logo">
                  <span>⚡</span>
                  <span>Razorpay</span>
                </div>
                <div class="sandbox-badge">
                  Sandbox Test Mode
                </div>
              </div>

              <div class="content">
                <div class="merchant-info">
                  <div>
                    <div class="merchant-name">${order.tenant.name}</div>
                    <div class="order-ref">Order #${order.orderNumber}</div>
                  </div>
                  <div class="amount-display">
                    <div class="amount-label">Amount Payable</div>
                    <div class="amount-val">₹${Number(order.total).toFixed(2)}</div>
                  </div>
                </div>

                <div class="items-box">
                  <div style="font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 600; margin-bottom: 8px;">
                    Order Summary
                  </div>
                  ${itemsListHtml}
                  <div style="display: flex; justify-content: space-between; padding-top: 8px; font-weight: 700; color: #f8fafc;">
                    <span>Total (incl. taxes & delivery)</span>
                    <span>₹${Number(order.total).toFixed(2)}</span>
                  </div>
                </div>

                ${
                  isPaid
                    ? `
                  <div class="paid-state">
                    <div class="paid-icon">🎉</div>
                    <h2 style="color: #22c55e; margin: 0 0 8px 0; font-size: 1.25rem;">Payment Already Confirmed</h2>
                    <p style="color: #94a3b8; font-size: 0.875rem; margin: 0 0 16px 0;">
                      Reference ID: <code style="color: #38bdf8;">${order.razorpayPaymentId || 'pay_test_' + order.id.slice(0, 8)}</code>
                    </p>
                    <p style="color: #64748b; font-size: 0.8125rem;">
                      Your order has been confirmed and WhatsApp notifications have been dispatched to <strong>${order.customerPhone}</strong>.
                    </p>
                  </div>
                `
                    : `
                  <div id="payment-actions">
                    <div style="font-size: 0.8125rem; color: #94a3b8; margin-bottom: 12px; text-align: center;">
                      Select a sandbox payment method to simulate instant payment:
                    </div>

                    <button type="button" class="btn-action btn-upi" onclick="simulatePayment('upi')">
                      ⚡ Pay with UPI (GPay / PhonePe / Paytm)
                    </button>

                    <button type="button" class="btn-action btn-card" onclick="simulatePayment('card')">
                      💳 Pay with Test Card (Visa / Mastercard)
                    </button>

                    <button type="button" class="btn-action btn-fail" onclick="simulatePayment('failed')">
                      ❌ Simulate Payment Failure
                    </button>
                  </div>

                  <div id="status-container" style="display: none; text-align: center; padding: 20px 0;">
                    <div id="status-spinner" style="display: inline-block; width: 36px; height: 36px; border: 3px solid rgba(56, 189, 248, 0.2); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                    <div id="status-message" style="margin-top: 14px; font-weight: 600; color: #f8fafc;">Processing with Razorpay Sandbox...</div>
                  </div>
                `
                }

                <div class="security-footer">
                  <span>🔒 256-bit Encrypted</span>
                  <span>•</span>
                  <span>Razorpay Safe</span>
                  <span>•</span>
                  <span>Test Environment</span>
                </div>
              </div>
            </div>

            <script>
              async function simulatePayment(method) {
                const actionsEl = document.getElementById('payment-actions');
                const statusEl = document.getElementById('status-container');
                const msgEl = document.getElementById('status-message');

                if (actionsEl) actionsEl.style.display = 'none';
                if (statusEl) statusEl.style.display = 'block';

                try {
                  const res = await fetch('/payments/checkout/${order.id}/simulate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ method }),
                  });

                  const data = await res.json();
                  if (data.status === 'success') {
                    statusEl.innerHTML = \`
                      <div style="font-size: 3rem; margin-bottom: 8px;">✅</div>
                      <h2 style="color: #22c55e; margin: 0 0 8px 0; font-size: 1.25rem;">Payment Successful!</h2>
                      <p style="color: #94a3b8; font-size: 0.875rem; margin-bottom: 16px;">
                        Payment ID: <strong style="color: #38bdf8;">\${data.paymentId}</strong>
                      </p>
                      <p style="color: #64748b; font-size: 0.8125rem;">
                        Order #${order.orderNumber} is now <strong>PAYMENT_CONFIRMED</strong>. Real-time WhatsApp confirmation sent to ${order.customerPhone}!
                      </p>
                    \`;
                  } else {
                    statusEl.innerHTML = \`
                      <div style="font-size: 3rem; margin-bottom: 8px;">❌</div>
                      <h2 style="color: #ef4444; margin: 0 0 8px 0; font-size: 1.25rem;">Payment Failed (Simulated)</h2>
                      <p style="color: #94a3b8; font-size: 0.875rem; margin-bottom: 16px;">
                        \${data.error || 'The customer bank declined the transaction.'}
                      </p>
                      <button class="btn-action btn-card" onclick="window.location.reload()">Try Again</button>
                    \`;
                  }
                } catch (err) {
                  statusEl.innerHTML = \`
                    <div style="color: #ef4444;">Network error while connecting to sandbox simulator.</div>
                  \`;
                }
              }
            </script>
            <style>
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            </style>
          </body>
        </html>
      `;

      return reply.type('text/html').send(html);
    }
  );

  // ─── 2. Sandbox Simulation Endpoint ─────────────────────────────
  fastify.post<{ Params: { orderId: string }; Body: { method?: string } }>(
    '/payments/checkout/:orderId/simulate',
    async (request, reply) => {
      const { orderId } = request.params;
      const { method = 'upi' } = request.body || {};

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          reservation: true,
          tenant: true,
        },
      });

      if (!order) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      if (method === 'failed') {
        return reply.status(200).send({
          status: 'failed',
          error: 'BAD_REQUEST_ERROR: Payment cancelled by user',
        });
      }

      const paymentId = `pay_test_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`;
      const razorpayOrderId = order.razorpayOrderId || `order_test_${order.id.slice(0, 8)}`;

      // Execute atomic confirmation
      await prisma.$transaction(async (tx) => {
        // 1. Mark order as confirmed
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'PAYMENT_CONFIRMED',
            paymentMethod: 'RAZORPAY_ONLINE',
            razorpayPaymentId: paymentId,
            razorpayOrderId,
            statusHistory: [
              ...((order.statusHistory as any[]) || []),
              {
                status: 'PAYMENT_CONFIRMED',
                timestamp: new Date(),
                updatedBy: 'razorpay_sandbox',
                note: `Simulated payment captured via ${method.toUpperCase()} (Payment ID: ${paymentId})`,
              },
            ],
          },
        });

        // 2. Commit inventory reservation and deduct stock
        if (order.reservationId) {
          const reservation = await tx.inventoryReservation.findUnique({
            where: { id: order.reservationId },
          });

          if (reservation && reservation.status === 'ACTIVE') {
            await tx.inventoryReservation.update({
              where: { id: reservation.id },
              data: { status: 'COMMITTED' },
            });

            const items = Array.isArray(reservation.items)
              ? (reservation.items as Array<{ productId: string; quantity: number }>)
              : [];

            for (const it of items) {
              if (it.productId && typeof it.quantity === 'number') {
                await tx.product.update({
                  where: { id: it.productId },
                  data: {
                    stock: { decrement: it.quantity },
                    reserved: { decrement: it.quantity },
                  },
                });
              }
            }
          }
        }

        // 3. Outbox event for guaranteed delivery
        await tx.outboxEvent.create({
          data: {
            tenantId: order.tenantId,
            aggregateId: order.id,
            aggregateType: 'ORDER',
            eventType: 'ORDER_PAID',
            payload: {
              orderId: order.id,
              orderNumber: order.orderNumber,
              total: order.total.toString(),
              customerPhone: order.customerPhone,
              razorpayPaymentId: paymentId,
            },
          },
        });
      });

      // 4. Send guaranteed WhatsApp confirmation message
      await notifyOrderPaymentConfirmed({
        order,
        transactionId: paymentId,
        method,
        gatewayName: 'Razorpay',
      });

      return reply.status(200).send({
        status: 'success',
        orderNumber: order.orderNumber,
        paymentId,
        orderId: order.id,
      });
    }
  );
};
