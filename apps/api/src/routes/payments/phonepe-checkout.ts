import { type FastifyPluginAsync } from 'fastify';
import { prisma } from '@wcos/db';
import { notifyOrderPaymentConfirmed } from '../../services/payment-notifications.js';

/**
 * PhonePe Sandbox Checkout Simulator
 *
 * Mirrors PhonePe's Pay Page UI for local development and testing.
 * Provides UPI (QR / VPA), PhonePe app deep-link, and card flows with
 * simulated immediate success or failure responses.
 *
 * Routes:
 *   GET  /payments/checkout/phonepe/:orderId  → Hosted checkout page
 *   POST /payments/checkout/phonepe/:orderId/simulate → Atomic payment simulation
 */
export const phonePeCheckoutRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── 1. Hosted PhonePe Sandbox Checkout Page ─────────────────────
  fastify.get<{
    Params: { orderId: string };
    Querystring: { amount?: string; ref?: string; tenantId?: string; txn?: string };
  }>(
    '/payments/checkout/phonepe/:orderId',
    async (request, reply) => {
      const { orderId } = request.params;
      const { txn = '' } = request.query;

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
      if (!isUuid) {
        return reply.status(404).type('text/html').send(`
          <!DOCTYPE html>
          <html><head><meta charset="utf-8"><title>Order Not Found — PhonePe Sandbox</title>
          <style>body{font-family:sans-serif;background:#0d0d1a;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{background:#1e293b;border:1px solid #334155;padding:32px;border-radius:12px;max-width:440px;text-align:center}h1{color:#ef4444;font-size:1.25rem;margin-top:0}</style>
          </head><body><div class="card"><h1>Order Not Found</h1><p>Invalid order reference provided.</p></div></body></html>
        `);
      }

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          tenant: { select: { name: true, ownerPhone: true } },
        },
      });

      if (!order) {
        return reply.status(404).type('text/html').send(`
          <!DOCTYPE html>
          <html><head><meta charset="utf-8"><title>Order Not Found — PhonePe Sandbox</title>
          <style>body{font-family:sans-serif;background:#0d0d1a;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{background:#1e293b;border:1px solid #334155;padding:32px;border-radius:12px;max-width:440px;text-align:center}h1{color:#ef4444;font-size:1.25rem;margin-top:0}</style>
          </head><body><div class="card"><h1>Order Not Found</h1><p>This checkout session has expired or the order reference does not exist.</p></div></body></html>
        `);
      }

      const isPaid =
        order.status === 'PAYMENT_CONFIRMED' ||
        order.status === 'PROCESSING' ||
        order.status === 'SHIPPED' ||
        order.status === 'DELIVERED';

      const itemsListHtml = order.items
        .map(
          (it) => `
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #1e3a5f;font-size:0.875rem;">
            <span>${it.productName} <strong style="color:#93c5fd;">x${it.quantity}</strong></span>
            <span style="font-weight:600;">₹${Number(it.totalAtOrder).toFixed(2)}</span>
          </div>`
        )
        .join('');

      const html = `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>PhonePe Sandbox — ${order.orderNumber}</title>
            <style>
              * { box-sizing: border-box; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: linear-gradient(135deg, #0d0d1a 0%, #0a0f1e 100%);
                color: #f1f5f9;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0;
                padding: 16px;
              }
              .checkout-card {
                background: #0f172a;
                border: 1px solid #1e293b;
                box-shadow: 0 20px 25px -5px rgba(0,0,0,0.6), 0 8px 10px -6px rgba(0,0,0,0.4);
                border-radius: 20px;
                width: 100%;
                max-width: 420px;
                overflow: hidden;
              }
              .header {
                background: linear-gradient(135deg, #5a1b9a 0%, #7c3aed 50%, #6d28d9 100%);
                padding: 22px 24px;
                display: flex;
                align-items: center;
                justify-content: space-between;
              }
              .header-brand {
                display: flex;
                align-items: center;
                gap: 10px;
                font-weight: 800;
                font-size: 1.25rem;
                color: #ffffff;
                letter-spacing: -0.02em;
              }
              .phonepe-logo {
                width: 32px;
                height: 32px;
                background: white;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1rem;
              }
              .sandbox-pill {
                background: rgba(255,255,255,0.18);
                backdrop-filter: blur(4px);
                padding: 4px 10px;
                border-radius: 999px;
                font-size: 0.625rem;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: #e9d5ff;
              }
              .content { padding: 22px; }
              .merchant-row {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 18px;
                padding-bottom: 14px;
                border-bottom: 1px solid #1e293b;
              }
              .merchant-name { font-size: 1.0625rem; font-weight: 700; color: #f8fafc; }
              .order-ref { font-size: 0.75rem; color: #94a3b8; font-family: monospace; margin-top: 2px; }
              .amount-val { font-size: 1.625rem; font-weight: 800; color: #a78bfa; text-align: right; }
              .amount-label { font-size: 0.6875rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; text-align: right; }
              .items-box {
                background: #0a0f1e;
                border: 1px solid #1e293b;
                border-radius: 10px;
                padding: 12px 14px;
                margin-bottom: 18px;
              }
              .items-title { font-size: 0.6875rem; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 8px; letter-spacing: 0.05em; }
              .btn-action {
                display: block;
                width: 100%;
                padding: 14px;
                border: none;
                border-radius: 10px;
                font-weight: 700;
                font-size: 0.9375rem;
                cursor: pointer;
                transition: all 0.2s;
                margin-bottom: 10px;
                text-align: center;
              }
              .btn-phonepe {
                background: linear-gradient(135deg, #5a1b9a 0%, #7c3aed 100%);
                color: white;
                letter-spacing: -0.01em;
              }
              .btn-phonepe:hover { opacity: 0.9; transform: translateY(-1px); }
              .btn-upi {
                background: linear-gradient(135deg, #059669 0%, #10b981 100%);
                color: white;
              }
              .btn-upi:hover { opacity: 0.9; }
              .btn-fail {
                background: #1e293b;
                color: #64748b;
                font-size: 0.8125rem;
                padding: 10px;
              }
              .btn-fail:hover { background: #334155; color: #94a3b8; }
              .paid-state { text-align: center; padding: 20px 0; }
              .paid-icon { font-size: 3rem; margin-bottom: 10px; }
              .security-footer {
                margin-top: 16px;
                padding-top: 14px;
                border-top: 1px solid #1e293b;
                text-align: center;
                font-size: 0.6875rem;
                color: #475569;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
              }
              @keyframes spin { to { transform: rotate(360deg); } }
              @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
            </style>
          </head>
          <body>
            <div class="checkout-card">
              <div class="header">
                <div class="header-brand">
                  <div class="phonepe-logo">💜</div>
                  <span>PhonePe</span>
                </div>
                <div class="sandbox-pill">Sandbox Test</div>
              </div>

              <div class="content">
                <div class="merchant-row">
                  <div>
                    <div class="merchant-name">${order.tenant.name}</div>
                    <div class="order-ref">Order #${order.orderNumber}</div>
                    ${txn ? `<div class="order-ref">Txn: ${txn}</div>` : ''}
                  </div>
                  <div>
                    <div class="amount-label">Amount Payable</div>
                    <div class="amount-val">₹${Number(order.total).toFixed(2)}</div>
                  </div>
                </div>

                <div class="items-box">
                  <div class="items-title">Order Summary</div>
                  ${itemsListHtml}
                  <div style="display:flex;justify-content:space-between;padding-top:8px;font-weight:700;color:#f8fafc;font-size:0.875rem;">
                    <span>Total (incl. delivery)</span>
                    <span>₹${Number(order.total).toFixed(2)}</span>
                  </div>
                </div>

                ${
                  isPaid
                    ? `<div class="paid-state">
                        <div class="paid-icon">🎉</div>
                        <h2 style="color:#4ade80;margin:0 0 8px;font-size:1.125rem;">Payment Already Confirmed</h2>
                        <p style="color:#94a3b8;font-size:0.875rem;">
                          Reference: <code style="color:#a78bfa;">${order.razorpayPaymentId || 'PHONEPE_TXN_' + order.id.slice(0, 8)}</code>
                        </p>
                        <p style="color:#64748b;font-size:0.8125rem;margin-top:8px;">
                          WhatsApp confirmation sent to <strong>${order.customerPhone}</strong>
                        </p>
                      </div>`
                    : `<div id="payment-actions">
                        <div style="font-size:0.8rem;color:#94a3b8;margin-bottom:12px;text-align:center;">
                          Select a sandbox payment method to simulate:
                        </div>

                        <button type="button" class="btn-action btn-phonepe" onclick="simulatePayment('phonepe_app')">
                          💜 Pay via PhonePe App (Simulated)
                        </button>

                        <button type="button" class="btn-action btn-upi" onclick="simulatePayment('upi_qr')">
                          ⚡ Pay via UPI / QR (GPay, Paytm, BHIM)
                        </button>

                        <button type="button" class="btn-action btn-fail" onclick="simulatePayment('failed')">
                          ❌ Simulate Payment Failure
                        </button>
                      </div>

                      <div id="status-container" style="display:none;text-align:center;padding:20px 0;animation:fadeIn 0.3s ease;">
                        <div id="status-spinner" style="display:inline-block;width:36px;height:36px;border:3px solid rgba(167,139,250,0.2);border-top-color:#a78bfa;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
                        <div style="margin-top:14px;font-weight:600;color:#f8fafc;">Processing via PhonePe Sandbox...</div>
                      </div>`
                }

                <div class="security-footer">
                  <span>🔒 256-bit Secured</span>
                  <span>•</span>
                  <span>PhonePe Safe</span>
                  <span>•</span>
                  <span>Test Environment</span>
                </div>
              </div>
            </div>

            <script>
              async function simulatePayment(method) {
                const actionsEl = document.getElementById('payment-actions');
                const statusEl = document.getElementById('status-container');

                if (actionsEl) actionsEl.style.display = 'none';
                if (statusEl) statusEl.style.display = 'block';

                try {
                  const res = await fetch('/payments/checkout/phonepe/${order.id}/simulate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ method }),
                  });

                  const data = await res.json();
                  if (data.status === 'success') {
                    statusEl.innerHTML = \`
                      <div style="font-size:3rem;margin-bottom:8px;">✅</div>
                      <h2 style="color:#4ade80;margin:0 0 8px;font-size:1.25rem;">Payment Successful!</h2>
                      <p style="color:#94a3b8;font-size:0.875rem;margin-bottom:10px;">
                        Transaction ID: <strong style="color:#a78bfa;">\${data.transactionId}</strong>
                      </p>
                      <p style="color:#64748b;font-size:0.8125rem;">
                        Order #${order.orderNumber} is now <strong>PAYMENT_CONFIRMED</strong>.<br/>
                        WhatsApp confirmation sent to ${order.customerPhone}! ✨
                      </p>
                    \`;
                  } else {
                    statusEl.innerHTML = \`
                      <div style="font-size:3rem;margin-bottom:8px;">❌</div>
                      <h2 style="color:#ef4444;margin:0 0 8px;font-size:1.25rem;">Payment Failed (Simulated)</h2>
                      <p style="color:#94a3b8;font-size:0.875rem;margin-bottom:16px;">
                        \${data.error || 'Payment declined. Please try again.'}
                      </p>
                      <button class="btn-action btn-phonepe" onclick="window.location.reload()">Try Again</button>
                    \`;
                  }
                } catch {
                  statusEl.innerHTML = '<div style="color:#ef4444;">Network error connecting to sandbox simulator.</div>';
                }
              }
            </script>
          </body>
        </html>
      `;

      return reply.type('text/html').send(html);
    }
  );

  // ─── 2. PhonePe Sandbox Simulation Endpoint ───────────────────────
  fastify.post<{ Params: { orderId: string }; Body: { method?: string } }>(
    '/payments/checkout/phonepe/:orderId/simulate',
    async (request, reply) => {
      const { orderId } = request.params;
      const { method = 'phonepe_app' } = request.body || {};

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
      if (!isUuid) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { reservation: true, tenant: true },
      });

      if (!order) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      if (method === 'failed') {
        return reply.status(200).send({
          status: 'failed',
          error: 'PAYMENT_ERROR: Transaction declined by PhonePe (simulated)',
        });
      }

      const transactionId = `PHONEPE_TXN_${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'PAYMENT_CONFIRMED',
            paymentMethod: 'PHONEPE_ONLINE' as any,
            razorpayPaymentId: transactionId,
            razorpayOrderId: `PHONEPE:${transactionId}`,
            statusHistory: [
              ...((order.statusHistory as any[]) || []),
              {
                status: 'PAYMENT_CONFIRMED',
                timestamp: new Date().toISOString(),
                updatedBy: 'phonepe_sandbox',
                note: `Simulated PhonePe payment via ${method.toUpperCase()} (Txn: ${transactionId})`,
              },
            ],
          },
        });

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

        // Reset any active conversation waiting for this order
        await tx.conversation.updateMany({
          where: { tenantId: order.tenantId, pendingOrderId: order.id },
          data: {
            stage: 'POST_ORDER',
            pendingOrderId: null,
          },
        });

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
              phonePeTransactionId: transactionId,
            },
          },
        });
      });

      await notifyOrderPaymentConfirmed({
        order,
        transactionId,
        method,
        gatewayName: 'PhonePe',
      });

      return reply.status(200).send({
        status: 'success',
        orderNumber: order.orderNumber,
        transactionId,
        orderId: order.id,
      });
    }
  );
};
