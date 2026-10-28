import { prisma } from '@wcos/db';
import { type LLMAction } from '@wcos/types';
import {
  razorpayService,
  paymentGatewayRouter,
  normalizePaymentUrl,
  type CustomerPlatform,
} from '@wcos/payments';
import { type StoredCart } from '../orchestrator/context-builder.js';

export interface ToolExecutionResult {
  reply: string;
  updatedCart?: StoredCart;
  mediaUrl?: string;
  buttons?: Array<{ id: string; title: string }>;
  newStage?: any;
}

async function findProductByCode(tenantId: string, inputCode: string) {
  if (!inputCode) return null;
  const normalized = inputCode.toUpperCase().trim();
  let product = await prisma.product.findUnique({
    where: {
      tenantId_code: { tenantId, code: normalized },
    },
  });

  if (!product) {
    const cleanInput = inputCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const candidates = await prisma.product.findMany({
      where: { tenantId, status: 'ACTIVE' },
    });
    product =
      candidates.find(
        (p) =>
          p.code.toUpperCase() === normalized ||
          p.code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === cleanInput
      ) || null;
  }

  return product;
}

function formatAddress(addr: any): string {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  const lines: string[] = [];
  if (addr.name) lines.push(`• *Name:* ${addr.name}`);
  if (addr.address) lines.push(`• *Address:* ${addr.address}`);
  const cityPin = [addr.city, addr.pincode].filter(Boolean).join(' - ');
  if (cityPin && !addr.address?.includes(cityPin)) lines.push(`• *City & Pincode:* ${cityPin}`);
  return lines.length > 0 ? lines.join('\n') : JSON.stringify(addr);
}

export interface BillItem {
  name: string;
  productCode: string;
  quantity: number;
  mrp: number;
  price: number;
  itemMrpTotal: number;
  itemTotal: number;
  discount: number;
}

export interface BillBreakdown {
  items: BillItem[];
  totalMrp: number;
  itemSubtotal: number;
  totalDiscount: number;
  shippingCharge: number;
  netPayable: number;
  currency: string;
  freeShippingThreshold: number;
}

export function computeBill(cart: StoredCart): BillBreakdown {
  const FREE_SHIPPING_THRESHOLD = 1999;
  const STANDARD_SHIPPING = 99;

  const items: BillItem[] = cart.items.map((i) => {
    const mrp = (i as any).mrp || i.price;
    const price = i.price;
    const itemMrpTotal = mrp * i.quantity;
    const itemTotal = price * i.quantity;
    const discount = Math.max(0, itemMrpTotal - itemTotal);
    return {
      name: i.name,
      productCode: i.productCode,
      quantity: i.quantity,
      mrp,
      price,
      itemMrpTotal,
      itemTotal,
      discount,
    };
  });

  const totalMrp = items.reduce((sum, i) => sum + i.itemMrpTotal, 0);
  const itemSubtotal = items.reduce((sum, i) => sum + i.itemTotal, 0);
  const totalDiscount = Math.max(0, totalMrp - itemSubtotal);
  const shippingCharge =
    items.length === 0 ? 0 : itemSubtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING;
  const netPayable = itemSubtotal + shippingCharge;

  return {
    items,
    totalMrp,
    itemSubtotal,
    totalDiscount,
    shippingCharge,
    netPayable,
    currency: 'INR',
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
  };
}

export function formatBillBreakdown(bill: BillBreakdown): string {
  if (bill.items.length === 0) {
    return 'Your shopping cart is currently empty.';
  }

  const itemLines = bill.items
    .map((item) => {
      const discountNote = item.discount > 0 ? ` _(Save ₹${item.discount.toFixed(2)})_` : '';
      const mrpNote = item.mrp > item.price ? `~₹${item.mrp.toFixed(2)}~ ` : '';
      return `• *${item.name}* (x${item.quantity})\n  ${mrpNote}*₹${item.price.toFixed(2)}* each = *₹${item.itemTotal.toFixed(2)}*${discountNote}`;
    })
    .join('\n');

  const deliveryNote =
    bill.shippingCharge === 0
      ? `FREE 🚚 _(Orders above ₹${bill.freeShippingThreshold})_`
      : `₹${bill.shippingCharge.toFixed(2)} 🚚 _(Free on orders above ₹${bill.freeShippingThreshold})_`;

  const savingsLine =
    bill.totalDiscount > 0
      ? `\n🎉 *You Save:* *₹${bill.totalDiscount.toFixed(2)}* on this order!`
      : '';

  return `🧾 *ORDER BILL BREAKDOWN*
━━━━━━━━━━━━━━━━━━━━━━━━
${itemLines}

━━━━━━━━━━━━━━━━━━━━━━━━
• *Items MRP Total:* ₹${bill.totalMrp.toFixed(2)}
• *Discounts Applied:* -₹${bill.totalDiscount.toFixed(2)}
• *Cart Subtotal:* ₹${bill.itemSubtotal.toFixed(2)}
• *Delivery Fee:* ${deliveryNote}
━━━━━━━━━━━━━━━━━━━━━━━━
💳 *Net Total Payable:* *₹${bill.netPayable.toFixed(2)}*${savingsLine}`;
}

export class ToolExecutionEngine {
  /**
   * Safely executes an action proposed by the LLM in a transactional context.
   */
  static async execute(
    tenantId: string,
    conversation: any,
    currentCart: StoredCart,
    action: LLMAction
  ): Promise<ToolExecutionResult> {
    switch (action.action) {
      case 'SEARCH_PRODUCTS': {
        const query = action.query.trim();
        const stopWords = new Set(['for', 'the', 'and', 'with', 'any', 'can', 'you', 'show', 'some', 'looking', 'want', 'need', 'please']);
        const keywords = query
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length >= 3 && !stopWords.has(w));

        const orConditions: any[] = [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { searchText: { contains: query, mode: 'insensitive' } },
          { category: { contains: query, mode: 'insensitive' } },
          { subcategory: { contains: query, mode: 'insensitive' } },
          { tags: { has: query.toLowerCase() } },
        ];

        for (const kw of keywords) {
          orConditions.push({ name: { contains: kw, mode: 'insensitive' } });
          orConditions.push({ searchText: { contains: kw, mode: 'insensitive' } });
          orConditions.push({ category: { contains: kw, mode: 'insensitive' } });
          orConditions.push({ subcategory: { contains: kw, mode: 'insensitive' } });
          orConditions.push({ tags: { has: kw } });
        }

        const candidates = await prisma.product.findMany({
          where: {
            tenantId,
            status: 'ACTIVE',
            OR: orConditions,
          },
          take: 20,
        });

        if (candidates.length === 0) {
          return {
            reply: `I searched our catalog for "${query}", but couldn't find any direct matches right now. Would you like to check our popular categories?`,
          };
        }

        // Rank candidates by number of matched keywords
        candidates.sort((a, b) => {
          const aText = `${a.searchText || ''} ${a.name} ${(a.tags || []).join(' ')}`.toLowerCase();
          const bText = `${b.searchText || ''} ${b.name} ${(b.tags || []).join(' ')}`.toLowerCase();
          const aScore = keywords.reduce((acc, k) => acc + (aText.includes(k) ? 1 : 0), 0);
          const bScore = keywords.reduce((acc, k) => acc + (bText.includes(k) ? 1 : 0), 0);
          return bScore - aScore;
        });

        const products = candidates.slice(0, 3);

        const productListText = products
          .map(
            (p) =>
              `• *${p.name}* (Code: \`${p.code}\`)\n  Price: *₹${Number(p.salePrice || p.price)}* ${
                p.stock > 0 ? '✅ In Stock' : '❌ Out of stock'
              }`
          )
          .join('\n\n');

        const intro = action.reply?.trim() || 'Here are our finest matching pieces for you: ✨';

        return {
          reply: `${intro}\n\n${productListText}`,
          mediaUrl: products[0]?.imageUrls[0],
        };
      }

      case 'SHOW_PRODUCT': {
        const product = await findProductByCode(tenantId, action.productCode);

        if (!product) {
          return {
            reply: `Sorry, I couldn't find any product with code *${action.productCode}*.`,
          };
        }

        const price = Number(product.salePrice || product.price);
        const details = `*${product.name}*\nCode: \`${product.code}\`\nPrice: *₹${price}*\nAvailability: ${
          product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'
        }\n\n${product.description || ''}`;

        return {
          reply: `${action.reply || ''}\n\n${details}`.trim(),
          mediaUrl: product.imageUrls[0],
          buttons:
            product.stock > 0
              ? [
                  { id: `add_${product.code}`, title: '🛒 Add to Cart' },
                  { id: `buy_${product.code}`, title: '⚡ Buy Now' },
                ]
              : undefined,
        };
      }

      case 'ADD_TO_CART': {
        const product = await findProductByCode(tenantId, action.productCode);

        if (!product) {
          return {
            reply: `Sorry, product *${action.productCode}* was not found in our catalog.`,
          };
        }

        const quantity = Number(action.quantity) || 1;
        const availableStock = product.stock - product.reserved;
        if (availableStock < quantity) {
          return {
            reply: `Sorry! Only ${Math.max(0, availableStock)} unit(s) of *${product.name}* are available right now.`,
          };
        }

        const unitPrice = Number(product.salePrice || product.price);
        const mrp = Number(product.price);
        const newCart: StoredCart = {
          items: [...currentCart.items],
          subtotal: currentCart.subtotal,
        };

        // Check if item already in cart
        const existingIndex = newCart.items.findIndex(
          (i) => i.productCode === product.code || i.productId === product.id
        );

        if (existingIndex >= 0) {
          const item = newCart.items[existingIndex]!;
          item.quantity += quantity;
          if (!item.mrp) item.mrp = mrp;
        } else {
          newCart.items.push({
            productId: product.id,
            productCode: product.code,
            name: product.name,
            quantity: quantity,
            price: unitPrice,
            mrp: mrp,
            imageUrl: product.imageUrls[0],
          });
        }

        // Recalculate subtotal
        newCart.subtotal = newCart.items.reduce(
          (sum, i) => sum + i.price * i.quantity,
          0
        );

        // Soft-reserve inventory with 15m TTL in PostgreSQL
        await prisma.product.update({
          where: { id: product.id },
          data: {
            reserved: { increment: quantity },
          },
        });

        // Persist updated cart in conversation metadata
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            stage: 'CART_ACTIVE',
            metadata: {
              ...(conversation.metadata as object),
              cart: newCart as any,
            },
          },
        });

        const bill = computeBill(newCart);
        const replyIntro = action.reply?.trim() || `Added *${quantity}x ${product.name}* to your cart! ✨`;
        const reply = `${replyIntro}\n\n${formatBillBreakdown(bill)}\n\nWould you like to proceed to checkout or look at more pieces?`;

        return {
          reply,
          updatedCart: newCart,
          newStage: 'CART_ACTIVE',
          buttons: [
            { id: 'view_cart', title: '🛍️ View Cart' },
            { id: 'checkout', title: '💳 Checkout' },
          ],
        };
      }

      case 'REMOVE_FROM_CART': {
        const cleanCode = (action.productCode || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const itemToRemove = currentCart.items.find(
          (i) =>
            i.productCode.toUpperCase() === action.productCode?.toUpperCase() ||
            i.productCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === cleanCode
        );

        if (!itemToRemove) {
          return {
            reply: `Item *${action.productCode}* is not in your cart.`,
          };
        }

        const newCart: StoredCart = {
          items: currentCart.items.filter((i) => i.productId !== itemToRemove.productId),
          subtotal: 0,
        };
        newCart.subtotal = newCart.items.reduce(
          (sum, i) => sum + i.price * i.quantity,
          0
        );

        // Release soft reservation
        await prisma.product.update({
          where: { id: itemToRemove.productId },
          data: {
            reserved: { decrement: itemToRemove.quantity },
          },
        });

        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            stage: newCart.items.length > 0 ? 'CART_ACTIVE' : 'BROWSING',
            metadata: {
              ...(conversation.metadata as object),
              cart: newCart as any,
            },
          },
        });

        if (newCart.items.length === 0) {
          return {
            reply: `Removed *${itemToRemove.name}* from your cart. Your cart is now empty. What would you like to explore next?`,
            updatedCart: newCart,
          };
        }

        const bill = computeBill(newCart);
        return {
          reply: `Removed *${itemToRemove.name}* from your cart.\n\n${formatBillBreakdown(bill)}\n\nWould you like to proceed to checkout?`,
          updatedCart: newCart,
        };
      }

      case 'UPDATE_CART_QUANTITY': {
        const cleanCode = (action.productCode || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const itemIndex = currentCart.items.findIndex(
          (i) =>
            i.productCode.toUpperCase() === action.productCode?.toUpperCase() ||
            i.productCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === cleanCode
        );

        if (itemIndex < 0) {
          return {
            reply: `Item *${action.productCode}* is not in your cart.`,
          };
        }

        const item = currentCart.items[itemIndex]!;
        const targetQty = Number(action.quantity) || 1;
        const delta = targetQty - item.quantity;

        const product = await findProductByCode(tenantId, item.productCode);
        if (product && delta > 0) {
          const availableStock = product.stock - product.reserved;
          if (availableStock < delta) {
            return {
              reply: `Sorry! Only ${Math.max(0, availableStock)} more unit(s) of *${product.name}* are available right now.`,
            };
          }
        }

        const newCart: StoredCart = {
          items: [...currentCart.items],
          subtotal: 0,
        };

        if (targetQty <= 0) {
          newCart.items.splice(itemIndex, 1);
        } else {
          newCart.items[itemIndex] = {
            ...item,
            quantity: targetQty,
          };
        }

        newCart.subtotal = newCart.items.reduce(
          (sum, i) => sum + i.price * i.quantity,
          0
        );

        if (product && delta !== 0) {
          await prisma.product.update({
            where: { id: product.id },
            data: {
              reserved: delta > 0 ? { increment: delta } : { decrement: Math.abs(delta) },
            },
          });
        }

        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            stage: newCart.items.length > 0 ? 'CART_ACTIVE' : 'BROWSING',
            metadata: {
              ...(conversation.metadata as object),
              cart: newCart as any,
            },
          },
        });

        const bill = computeBill(newCart);
        return {
          reply: action.reply || `Updated *${item.name}* quantity to ${targetQty}.\n\n${formatBillBreakdown(bill)}`,
          updatedCart: newCart,
        };
      }

      case 'VIEW_CART': {
        if (currentCart.items.length === 0) {
          return {
            reply: 'Your shopping cart is currently empty. Would you like me to recommend our bestsellers?',
          };
        }

        const bill = computeBill(currentCart);

        return {
          reply: `🛍️ *Your Shopping Cart:*\n\n${formatBillBreakdown(bill)}\n\nWould you like to proceed to checkout?`,
          buttons: [
            { id: 'checkout', title: '💳 Proceed to Pay' },
            { id: 'clear_cart', title: '🗑️ Clear Cart' },
          ],
        };
      }

      case 'CLEAR_CART': {
        // Release all reservations
        for (const item of currentCart.items) {
          await prisma.product.update({
            where: { id: item.productId },
            data: {
              reserved: { decrement: item.quantity },
            },
          });
        }

        const emptyCart: StoredCart = { items: [], subtotal: 0 };
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            stage: 'BROWSING',
            metadata: {
              ...(conversation.metadata as object),
              cart: emptyCart as any,
            },
          },
        });

        return {
          reply: 'Your cart has been cleared. What would you like to explore next?',
          updatedCart: emptyCart,
          newStage: 'BROWSING',
        };
      }

      case 'REQUEST_DELIVERY_ADDRESS': {
        const bill = computeBill(currentCart);
        const billText = currentCart.items.length > 0 ? `\n\n${formatBillBreakdown(bill)}` : '';

        const lastOrderWithAddress = await prisma.order.findFirst({
          where: {
            tenantId,
            customerPhone: conversation.customerPhone,
            deliveryAddress: { not: null as any },
          },
          orderBy: { createdAt: 'desc' },
        });

        const memory = await prisma.customerMemory.findUnique({
          where: {
            tenantId_customerPhone: {
              tenantId,
              customerPhone: conversation.customerPhone,
            },
          },
        });

        const preferredAttrs = (memory?.preferredAttributes as Record<string, any>) || {};
        const savedAddress =
          preferredAttrs['savedAddress'] ||
          (lastOrderWithAddress?.deliveryAddress as any) ||
          undefined;

        if (savedAddress) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              stage: 'CHECKOUT_CONFIRM',
              metadata: {
                ...(conversation.metadata as object),
                pendingDeliveryAddress: savedAddress,
              },
            },
          });

          return {
            reply: `📦 *Delivery Address on file:*\n\n${formatAddress(savedAddress)}${billText}\n\nWould you like us to deliver to this address, or would you like to use a different delivery address?`,
            newStage: 'CHECKOUT_CONFIRM',
            buttons: [
              { id: 'confirm_address', title: '✅ Deliver Here' },
              { id: 'change_address', title: '✏️ Change Address' },
            ],
          };
        }

        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            stage: 'CHECKOUT_ADDRESS',
          },
        });

        return {
          reply: `${currentCart.items.length > 0 ? formatBillBreakdown(bill) + '\n\n' : ''}To get your order delivered safely, please share your delivery address: 📍\n\n• *Full Name*\n• *House / Flat No & Street / Locality*\n• *City & Pincode*`,
          newStage: 'CHECKOUT_ADDRESS',
        };
      }

      case 'CONFIRM_DELIVERY_ADDRESS': {
        const meta = (conversation.metadata as Record<string, any>) || {};

        // ─── IDEMPOTENCY GUARD ────────────────────────────────────────────────────
        // If address was already confirmed and saved in this session, never re-ask.
        // This is the primary defence against the verification loop.
        if (meta['addressConfirmed'] && meta['deliveryAddress']) {
          if (['CHECKOUT_ADDRESS', 'CHECKOUT_CONFIRM'].includes(conversation.stage)) {
            const bill = computeBill(currentCart);
            return {
              reply: `📍 *Delivery Details:*\n\n${formatAddress(meta['deliveryAddress'])}\n\n${formatBillBreakdown(bill)}\n\nShall I proceed to generate your secure payment link?`,
              newStage: 'CHECKOUT_CONFIRM',
              buttons: [
                { id: 'proceed_to_pay', title: '💳 Proceed to Pay' },
                { id: 'change_address', title: '✏️ Change Address' },
              ],
            };
          }
          return {
            reply: `✅ *Delivery Address already saved!* 📍\n\n${formatAddress(meta['deliveryAddress'])}`,
          };
        }

        const targetAddress =
          (action as any).deliveryAddress ||
          meta['pendingDeliveryAddress'] ||
          meta['deliveryAddress'];

        if (!targetAddress) {
          return {
            reply: `Please share your delivery address (Name, House/Street, City, Pincode): 📍`,
            newStage: 'CHECKOUT_ADDRESS',
          };
        }

        // Persist address to CustomerMemory so it's available across sessions
        const memory = await prisma.customerMemory.findUnique({
          where: { tenantId_customerPhone: { tenantId, customerPhone: conversation.customerPhone } },
        });

        if (memory) {
          const preferredAttrs = (memory.preferredAttributes as Record<string, any>) || {};
          await prisma.customerMemory.update({
            where: { id: memory.id },
            data: {
              customerName: targetAddress.name || memory.customerName,
              preferredAttributes: { ...preferredAttrs, savedAddress: targetAddress },
            },
          });
        }

        const isCheckoutFlow = ['CHECKOUT_ADDRESS', 'CHECKOUT_CONFIRM'].includes(conversation.stage);

        if (isCheckoutFlow) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              stage: 'CHECKOUT_CONFIRM',
              metadata: {
                ...meta,
                deliveryAddress: targetAddress,
                addressConfirmed: true,
                pendingDeliveryAddress: null,
              },
            },
          });

          const bill = computeBill(currentCart);
          return {
            reply: `📍 *Delivery Details:*\n\n${formatAddress(targetAddress)}\n\n${formatBillBreakdown(bill)}\n\nShall I proceed to generate your secure payment link?`,
            newStage: 'CHECKOUT_CONFIRM',
            buttons: [
              { id: 'proceed_to_pay', title: '💳 Proceed to Pay' },
              { id: 'change_address', title: '✏️ Change Address' },
            ],
          };
        }

        // Standalone address update (outside checkout flow)
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            metadata: {
              ...meta,
              deliveryAddress: targetAddress,
              addressConfirmed: true,
              pendingDeliveryAddress: null,
            },
          },
        });

        return {
          reply: `✅ *Delivery Address Saved!* 📍\n\n${formatAddress(targetAddress)}\n\nYour delivery details have been saved to your profile for future orders. What would you like to explore today? ✨`,
        };
      }

      case 'INITIATE_CHECKOUT': {
        if (currentCart.items.length === 0) {
          // Check if customer has an existing pending order to pay for
          const recentPendingOrder = await prisma.order.findFirst({
            where: {
              tenantId,
              customerPhone: conversation.customerPhone,
              status: 'PENDING_PAYMENT',
            },
            orderBy: { createdAt: 'desc' },
            include: { items: true },
          });

          if (recentPendingOrder) {
            let paymentUrl = normalizePaymentUrl(recentPendingOrder.trackingUrl);
            let gatewayName = recentPendingOrder.paymentMethod === 'PHONEPE_ONLINE' ? 'phonepe' : 'razorpay';

            if (!paymentUrl) {
              // Detect platform from conversation metadata
              const existingMeta = (conversation.metadata as Record<string, any>) || {};
              const platform = (existingMeta['customerPlatform'] as CustomerPlatform) || 'unknown';

              const routerResult = await paymentGatewayRouter.createPaymentLink(
                {
                  tenantId,
                  orderId: recentPendingOrder.id,
                  orderNumber: recentPendingOrder.orderNumber,
                  amount: Number(recentPendingOrder.total),
                  currency: recentPendingOrder.currency || 'INR',
                  customerPhone: conversation.customerPhone,
                  customerName: recentPendingOrder.customerName || conversation.customerPhone,
                },
                platform
              );
              paymentUrl = routerResult.paymentUrl;
              gatewayName = routerResult.gateway;

              await prisma.order.update({
                where: { id: recentPendingOrder.id },
                data: {
                  trackingUrl: paymentUrl,
                  razorpayOrderId: routerResult.phonePeTransactionId
                    ? `PHONEPE:${routerResult.phonePeTransactionId}`
                    : routerResult.razorpayOrderId || undefined,
                  paymentMethod: routerResult.paymentMethod,
                },
              });
            }

            const gatewayTag = gatewayName === 'phonepe'
              ? ' _(PhonePe Sandbox)_'
              : (razorpayService.isSandbox ? ' _(Razorpay Sandbox)_' : '');

            return {
              reply: `Here is your secure payment link${gatewayTag} for Order *#${recentPendingOrder.orderNumber}* totaling *₹${Number(recentPendingOrder.total).toFixed(2)}*:\n👉 ${paymentUrl}\n\n💳 UPI (PhonePe, GPay, Paytm), Cards & Netbanking accepted.\n⏳ *Reservation:* Your items are reserved. Please complete payment to confirm your order! ✨`,
            };
          }

          return {
            reply: 'Your cart is empty. Please add items before checking out.',
          };
        }

        const meta = (conversation.metadata as Record<string, any>) || {};
        const actionAddress = (action as any).deliveryAddress;

        // Robust address resolution — prevents checkout loop regardless of which
        // metadata key was used to store the address or how the address object is shaped.
        const isValidAddr = (addr: any): boolean =>
          !!addr &&
          typeof addr === 'object' &&
          !!(addr.address || addr.name || addr.pincode || addr.city);

        let confirmedAddress: any =
          isValidAddr(actionAddress)
            ? actionAddress
            : (meta['addressConfirmed'] && meta['deliveryAddress'])
              ? meta['deliveryAddress']
              // Returning-customer "Deliver Here" path:
              // pendingDeliveryAddress was staged by REQUEST_DELIVERY_ADDRESS.
              // When the customer taps the button we land here via INITIATE_CHECKOUT.
              : (conversation.stage === 'CHECKOUT_CONFIRM' && meta['pendingDeliveryAddress'])
                ? meta['pendingDeliveryAddress']
                : null;

        const bill = computeBill(currentCart);

        // If address not explicitly confirmed, check if customer has a saved address or needs to provide one
        if (!confirmedAddress) {
          const lastOrderWithAddress = await prisma.order.findFirst({
            where: {
              tenantId,
              customerPhone: conversation.customerPhone,
              deliveryAddress: { not: null as any },
            },
            orderBy: { createdAt: 'desc' },
          });

          const memory = await prisma.customerMemory.findUnique({
            where: {
              tenantId_customerPhone: {
                tenantId,
                customerPhone: conversation.customerPhone,
              },
            },
          });

          const preferredAttrs = (memory?.preferredAttributes as Record<string, any>) || {};
          const savedAddress =
            preferredAttrs['savedAddress'] ||
            (lastOrderWithAddress?.deliveryAddress as any) ||
            undefined;

          if (savedAddress) {
            // RETURNING CUSTOMER: Ask for confirmation of previous delivery details with bill breakdown
            await prisma.conversation.update({
              where: { id: conversation.id },
              data: {
                stage: 'CHECKOUT_CONFIRM',
                metadata: {
                  ...meta,
                  pendingDeliveryAddress: savedAddress,
                },
              },
            });

            return {
              reply: `📦 *Delivery Address on file:*\n\n${formatAddress(savedAddress)}\n\n${formatBillBreakdown(bill)}\n\nWould you like us to deliver to this address, or would you like to use a different delivery address?`,
              newStage: 'CHECKOUT_CONFIRM',
              buttons: [
                { id: 'confirm_address', title: '✅ Deliver Here' },
                { id: 'change_address', title: '✏️ Change Address' },
              ],
            };
          } else {
            // NEW CUSTOMER: Ask for delivery details first before sending payments with bill breakdown
            await prisma.conversation.update({
              where: { id: conversation.id },
              data: {
                stage: 'CHECKOUT_ADDRESS',
              },
            });

            return {
              reply: `${formatBillBreakdown(bill)}\n\nTo get your order delivered safely, please share your delivery address: 📍\n\n• *Full Name*\n• *House / Flat No & Street / Locality*\n• *City & Pincode*`,
              newStage: 'CHECKOUT_ADDRESS',
            };
          }
        }

        const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

        // Create atomic order and order items with price snapshots
        const order = await prisma.$transaction(async (tx) => {
          const newOrder = await tx.order.create({
            data: {
              tenantId,
              customerPhone: conversation.customerPhone,
              customerName: confirmedAddress?.name || undefined,
              orderNumber,
              subtotal: bill.itemSubtotal,
              discount: bill.totalDiscount,
              shippingCharge: bill.shippingCharge,
              total: bill.netPayable,
              currency: 'INR',
              status: 'PENDING_PAYMENT',
              deliveryAddress: confirmedAddress as any,
            },
          });

          // Create immutable OrderItem snapshots
          for (const item of currentCart.items) {
            await tx.orderItem.create({
              data: {
                orderId: newOrder.id,
                productId: item.productId,
                productCode: item.productCode,
                productName: item.name,
                productImageUrl: item.imageUrl,
                quantity: item.quantity,
                priceAtOrder: item.price,
                totalAtOrder: item.price * item.quantity,
              },
            });
          }

          // Persist address in CustomerMemory and mark repeat customer
          await tx.customerMemory.upsert({
            where: {
              tenantId_customerPhone: {
                tenantId,
                customerPhone: conversation.customerPhone,
              },
            },
            create: {
              tenantId,
              customerPhone: conversation.customerPhone,
              customerName: confirmedAddress?.name || null,
              totalOrders: 1,
              isRepeatCustomer: false,
              preferredAttributes: {
                savedAddress: confirmedAddress,
              },
            },
            update: {
              customerName: confirmedAddress?.name || undefined,
              totalOrders: { increment: 1 },
              isRepeatCustomer: true,
              preferredAttributes: {
                savedAddress: confirmedAddress,
              },
            },
          });

          return newOrder;
        });

        // Generate payment link via the gateway router (PhonePe for mobile, Razorpay for web)
        const tenantInfo = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true },
        });

        // Detect platform from conversation metadata (set by WhatsApp/web session)
        const platform = (meta['customerPlatform'] as CustomerPlatform) || 'unknown';

        const routerResult = await paymentGatewayRouter.createPaymentLink(
          {
            tenantId,
            orderId: order.id,
            orderNumber: order.orderNumber,
            amount: Number(order.total),
            currency: order.currency || 'INR',
            customerName: confirmedAddress?.name || conversation.customerPhone,
            customerPhone: conversation.customerPhone,
            description: `Order #${order.orderNumber} - ${tenantInfo?.name || 'Store'}`,
          },
          platform
        );

        const paymentUrl = routerResult.paymentUrl;

        // Update order with payment link details
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentMethod: routerResult.paymentMethod,
            razorpayOrderId: routerResult.phonePeTransactionId
              ? `PHONEPE:${routerResult.phonePeTransactionId}`
              : routerResult.razorpayOrderId || undefined,
            trackingUrl: paymentUrl,
          },
        });

        // Clear cart now that order is created
        const emptyCart: StoredCart = { items: [], subtotal: 0 };
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            stage: 'AWAITING_PAYMENT',
            pendingOrderId: order.id,
            metadata: {
              ...(conversation.metadata as object),
              cart: emptyCart as any,
              addressConfirmed: false,
              deliveryAddress: null,
            },
          },
        });

        const addressSummary = formatAddress(confirmedAddress);
        const gatewayLabel = routerResult.gateway === 'phonepe'
          ? 'PhonePe' + (routerResult.isSandboxMock ? ' _(Sandbox)_' : '')
          : 'Razorpay' + (razorpayService.isSandbox ? ' _(Sandbox)_' : '');

        const reply = `🎉 *Order #${orderNumber} Created!*\n\n${formatBillBreakdown(bill)}\n\n📍 *Delivery To:*\n${addressSummary}\n\nPlease complete your secure payment via ${gatewayLabel}:\n👉 ${paymentUrl}\n\n💳 *Payment Methods:* UPI (PhonePe, Google Pay, Paytm), Cards & Netbanking.\n⏳ *Reservation:* Your items are reserved for 15 minutes. Once payment is confirmed, your order will be dispatched immediately! ✨`;

        return {
          reply,
          updatedCart: emptyCart,
          newStage: 'AWAITING_PAYMENT',
        };
      }

      case 'REQUEST_HUMAN_HANDOFF': {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            stage: 'HUMAN_HANDOFF',
            handoffReason: action.reason,
          },
        });

        return {
          reply: action.reply || "I've connected you with our human support team. A team member will join this chat shortly to assist you!",
          newStage: 'HUMAN_HANDOFF',
        };
      }

      case 'ORDER_STATUS': {
        const recentOrder = await prisma.order.findFirst({
          where: {
            tenantId,
            customerPhone: conversation.customerPhone,
          },
          orderBy: { createdAt: 'desc' },
          include: { items: true },
        });

        if (!recentOrder) {
          return {
            reply: "I couldn't find any recent orders associated with your phone number. Would you like to place a new order?",
          };
        }

        return {
          reply: `📦 *Order #${recentOrder.orderNumber}*\nStatus: *${recentOrder.status}*\nTotal: *₹${Number(recentOrder.total).toFixed(2)}*\nItems: ${recentOrder.items.length}\nDate: ${recentOrder.createdAt.toLocaleDateString()}`,
        };
      }

      case 'NONE':
      default:
        return {
          reply: action.reply,
        };
    }
  }
}
