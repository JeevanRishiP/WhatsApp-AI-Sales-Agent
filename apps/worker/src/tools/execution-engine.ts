import crypto from 'node:crypto';
import { prisma } from '@wcos/db';
import { CartService } from '@wcos/queue';
import {
  type LLMAction,
  getDelhiveryLiveTrackingStatus,
  formatDelhiveryWhatsAppTrackingReply,
} from '@wcos/types';
import {
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function syncWhatsAppCartToRedis(
  tenantId: string,
  customerPhone: string,
  cart: StoredCart
): Promise<void> {
  try {
    if (cart.items.length === 0) {
      await CartService.clearCart(tenantId, customerPhone, 'wa');
      return;
    }
    const cleanDigits = customerPhone.replace(/[^0-9]/g, '');
    const now = new Date();
    await CartService.saveCart(
      {
        id: cart.reservationId || crypto.randomUUID(),
        tenantId,
        customerPhone: cleanDigits,
        channel: 'wa',
        items: cart.items.map((item) => ({
          productId: item.productId,
          productCode: item.productCode,
          productName: item.name,
          quantity: item.quantity,
          priceAtAdd: item.price,
          imageUrl: item.imageUrl,
          source: 'whatsapp',
          addedAt: now,
        })),
        subtotal: Number(cart.subtotal.toFixed(2)),
        currency: 'INR',
        itemCount: cart.items.reduce((s, i) => s + i.quantity, 0),
        createdAt: now,
        lastActivityAt: now,
        expiresAt: new Date(now.getTime() + 72 * 3600 * 1000),
      },
      customerPhone
    );
  } catch (err: any) {
    console.warn('[ExecutionEngine] Non-fatal Redis cart sync warning:', err.message);
  }
}

async function findProductByCode(tenantId: string, inputCode: string) {
  if (!inputCode) return null;
  const normalized = inputCode.toUpperCase().trim();
  const cleanInput = inputCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  return prisma.product.findFirst({
    where: {
      tenantId,
      status: 'ACTIVE',
      OR: [
        { code: normalized },
        { code: { equals: inputCode.trim(), mode: 'insensitive' } },
        ...(cleanInput ? [{ codeNormalized: cleanInput }] : []),
      ],
    },
  });
}

function formatAddress(addr: any): string {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  const lines: string[] = [];
  const name = addr.recipientName || addr.name;
  if (name) lines.push(`• *Name:* ${name}`);
  if (addr.phone) lines.push(`• *Phone:* ${addr.phone}`);
  const line1 = addr.line1 || addr.addressLine1 || addr.address;
  const line2 = addr.line2 || addr.addressLine2;
  if (line1) lines.push(`• *Street Address:* ${line1}${line2 ? ', ' + line2 : ''}`);
  if (addr.landmark) lines.push(`• *Landmark:* ${addr.landmark}`);
  const cityStatePin = [addr.city, addr.state].filter(Boolean).join(', ') + (addr.pincode ? ` - ${addr.pincode}` : '');
  if (cityStatePin && !line1?.includes(addr.pincode)) lines.push(`• *City & Pincode:* ${cityStatePin}`);
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
        const stopWords = new Set([
          'for', 'the', 'and', 'with', 'any', 'can', 'you', 'show', 'some', 'looking',
          'want', 'need', 'please', 'more', 'other', 'options', 'saree', 'sarees',
          'only', 'give', 'tell', 'all', 'in', 'of', 'me', 'i', 'collection', 'collections'
        ]);
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
          take: 50,
          orderBy: { code: 'asc' },
        });

        if (candidates.length === 0) {
          return {
            reply: `I searched our catalog for "${query}", but couldn't find any direct matches right now. Please tell me the product style, category, or price range you're looking for and I'll find the closest matches! ✨`,
          };
        }

        // Check which products were already shown in recent assistant messages of this conversation
        const recentMessages = await prisma.message.findMany({
          where: {
            conversationId: conversation.id,
            role: 'assistant',
          },
          select: { content: true },
          orderBy: { createdAt: 'desc' },
          take: 12,
        });

        const previouslyShownCodes = new Set<string>();
        const codePattern = /\b([A-Z]{3}-[A-Z0-9]{3}-\d{2})\b/g;
        for (const m of recentMessages) {
          const matched = m.content.match(codePattern);
          if (matched) {
            for (const c of matched) {
              previouslyShownCodes.add(c.toUpperCase());
            }
          }
        }

        // Rank candidates: unshown products FIRST, then highest keyword relevance
        candidates.sort((a, b) => {
          const aShown = previouslyShownCodes.has(a.code.toUpperCase()) ? 1 : 0;
          const bShown = previouslyShownCodes.has(b.code.toUpperCase()) ? 1 : 0;
          if (aShown !== bShown) {
            return aShown - bShown; // unshown (0) before shown (1)
          }
          const aText = `${a.searchText || ''} ${a.name} ${a.subcategory || ''} ${(a.tags || []).join(' ')}`.toLowerCase();
          const bText = `${b.searchText || ''} ${b.name} ${b.subcategory || ''} ${(b.tags || []).join(' ')}`.toLowerCase();
          const aScore = keywords.reduce((acc, k) => acc + (aText.includes(k) ? 1 : 0), 0);
          const bScore = keywords.reduce((acc, k) => acc + (bText.includes(k) ? 1 : 0), 0);
          return bScore - aScore;
        });

        // Determine how many products to show: prefer unshown products if available
        const unshownCandidates = candidates.filter((p) => !previouslyShownCodes.has(p.code.toUpperCase()));
        const products = unshownCandidates.length > 0
          ? unshownCandidates.slice(0, 3)
          : candidates.slice(0, 3);

        const productListText = products
          .map(
            (p) =>
              `• *${p.name}* (Code: \`${p.code}\`)\n  Price: *₹${Number(p.salePrice || p.price)}* ${
                p.stock > 0 ? '✅ In Stock' : '❌ Out of stock'
              }`
          )
          .join('\n\n');

        let intro = action.reply?.trim() || 'Here are our finest matching pieces for you: ✨';
        if (unshownCandidates.length > 0 && previouslyShownCodes.size > 0) {
          intro = 'Here are more exquisite designs from our collection: ✨';
        } else if (unshownCandidates.length === 0 && previouslyShownCodes.size > 0) {
          intro = `You have seen all our current pieces in this specific collection! Here are our featured favorites: ✨`;
        }

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

        const rawQty = action.quantity === undefined || action.quantity === null ? 1 : Number(action.quantity);
        const quantity = Number.isInteger(rawQty) && rawQty >= 1 && rawQty <= 20 ? rawQty : 1;

        // Atomic conditional reserve inside transaction + InventoryReservation TTL tracking
        const newCart: StoredCart = {
          items: currentCart.items.map((i) => ({ ...i })),
          subtotal: currentCart.subtotal,
          reservationId: currentCart.reservationId,
        };

        const unitPrice = Number(product.salePrice || product.price);
        const mrp = Number(product.price);
        const existingIndex = newCart.items.findIndex(
          (i) => i.productCode === product.code || i.productId === product.id
        );

        if (existingIndex >= 0) {
          const item = newCart.items[existingIndex]!;
          item.quantity += quantity;
          item.price = unitPrice;
          if (!item.mrp) item.mrp = mrp;
        } else {
          newCart.items.push({
            productId: product.id,
            productCode: product.code,
            name: product.name,
            quantity,
            price: unitPrice,
            mrp,
            imageUrl: product.imageUrls[0],
          });
        }

        newCart.subtotal = newCart.items.reduce(
          (sum, i) => sum + i.price * i.quantity,
          0
        );

        try {
          await prisma.$transaction(async (tx) => {
            const affected = await tx.$executeRaw`
              UPDATE "Product"
              SET reserved = reserved + ${quantity}, "updatedAt" = NOW()
              WHERE id = ${product.id}::uuid
                AND "tenantId" = ${tenantId}::uuid
                AND status = 'ACTIVE'
                AND (stock - reserved) >= ${quantity}
            `;
            if (affected !== 1) {
              throw new Error('OUT_OF_STOCK');
            }

            const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
            const reservationItems = newCart.items.map((it) => ({
              productId: it.productId,
              quantity: it.quantity,
            }));

            let updatedExistingReservation = false;
            if (newCart.reservationId) {
              const resUpdate = await tx.inventoryReservation.updateMany({
                where: { id: newCart.reservationId, tenantId, status: 'ACTIVE' },
                data: { items: reservationItems, expiresAt },
              });
              updatedExistingReservation = resUpdate.count === 1;
            }

            if (!updatedExistingReservation) {
              const createdRes = await tx.inventoryReservation.create({
                data: {
                  tenantId,
                  items: reservationItems,
                  expiresAt,
                  status: 'ACTIVE',
                },
              });
              newCart.reservationId = createdRes.id;
            }

            await tx.conversation.update({
              where: { id: conversation.id },
              data: {
                stage: 'CART_ACTIVE',
                metadata: {
                  ...(conversation.metadata as object),
                  cart: newCart as any,
                },
              },
            });
          });
        } catch (err: any) {
          if (err.message === 'OUT_OF_STOCK') {
            const avail = Math.max(0, product.stock - product.reserved);
            return {
              reply: `Sorry! Only ${avail} unit(s) of *${product.name}* are available right now.`,
            };
          }
          throw err;
        }

        await syncWhatsAppCartToRedis(tenantId, conversation.customerPhone, newCart);

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
          reservationId: currentCart.reservationId,
        };
        newCart.subtotal = newCart.items.reduce(
          (sum, i) => sum + i.price * i.quantity,
          0
        );

        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            UPDATE "Product"
            SET reserved = GREATEST(0, reserved - ${itemToRemove.quantity}), "updatedAt" = NOW()
            WHERE id = ${itemToRemove.productId}::uuid AND "tenantId" = ${tenantId}::uuid
          `;

          if (newCart.reservationId) {
            if (newCart.items.length === 0) {
              await tx.inventoryReservation.updateMany({
                where: { id: newCart.reservationId, tenantId, status: 'ACTIVE' },
                data: { status: 'RELEASED' },
              });
              newCart.reservationId = undefined;
            } else {
              await tx.inventoryReservation.updateMany({
                where: { id: newCart.reservationId, tenantId, status: 'ACTIVE' },
                data: {
                  items: newCart.items.map((it) => ({
                    productId: it.productId,
                    quantity: it.quantity,
                  })),
                },
              });
            }
          }

          await tx.conversation.update({
            where: { id: conversation.id },
            data: {
              stage: newCart.items.length > 0 ? 'CART_ACTIVE' : 'BROWSING',
              metadata: {
                ...(conversation.metadata as object),
                cart: newCart as any,
              },
            },
          });
        });

        await syncWhatsAppCartToRedis(tenantId, conversation.customerPhone, newCart);

        if (newCart.items.length === 0) {
          return {
            reply: `Removed *${itemToRemove.name}* from your cart. Your cart is now empty. What would you like to explore next?`,
            updatedCart: newCart,
            newStage: 'BROWSING',
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
        const rawQty = action.quantity === undefined || action.quantity === null ? 1 : Number(action.quantity);
        if (!Number.isInteger(rawQty) || rawQty < 0 || rawQty > 20) {
          return { reply: 'Please specify a valid quantity between 0 and 20.' };
        }
        const targetQty = rawQty;
        const delta = targetQty - item.quantity;

        const product = await findProductByCode(tenantId, item.productCode);

        const newCart: StoredCart = {
          items: currentCart.items.map((i) => ({ ...i })),
          subtotal: 0,
          reservationId: currentCart.reservationId,
        };

        if (targetQty === 0) {
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

        try {
          await prisma.$transaction(async (tx) => {
            if (product && delta > 0) {
              const affected = await tx.$executeRaw`
                UPDATE "Product"
                SET reserved = reserved + ${delta}, "updatedAt" = NOW()
                WHERE id = ${product.id}::uuid
                  AND "tenantId" = ${tenantId}::uuid
                  AND (stock - reserved) >= ${delta}
              `;
              if (affected !== 1) throw new Error('OUT_OF_STOCK');
            } else if (product && delta < 0) {
              await tx.$executeRaw`
                UPDATE "Product"
                SET reserved = GREATEST(0, reserved - ${Math.abs(delta)}), "updatedAt" = NOW()
                WHERE id = ${product.id}::uuid AND "tenantId" = ${tenantId}::uuid
              `;
            }

            if (newCart.reservationId) {
              if (newCart.items.length === 0) {
                await tx.inventoryReservation.updateMany({
                  where: { id: newCart.reservationId, tenantId, status: 'ACTIVE' },
                  data: { status: 'RELEASED' },
                });
                newCart.reservationId = undefined;
              } else {
                await tx.inventoryReservation.updateMany({
                  where: { id: newCart.reservationId, tenantId, status: 'ACTIVE' },
                  data: {
                    items: newCart.items.map((it) => ({
                      productId: it.productId,
                      quantity: it.quantity,
                    })),
                  },
                });
              }
            }

            await tx.conversation.update({
              where: { id: conversation.id },
              data: {
                stage: newCart.items.length > 0 ? 'CART_ACTIVE' : 'BROWSING',
                metadata: {
                  ...(conversation.metadata as object),
                  cart: newCart as any,
                },
              },
            });
          });
        } catch (err: any) {
          if (err.message === 'OUT_OF_STOCK') {
            const avail = product ? Math.max(0, product.stock - product.reserved) : 0;
            return {
              reply: `Sorry! Only ${avail} more unit(s) of *${item.name}* are available right now.`,
            };
          }
          throw err;
        }

        await syncWhatsAppCartToRedis(tenantId, conversation.customerPhone, newCart);

        const bill = computeBill(newCart);
        return {
          reply:
            targetQty === 0
              ? `Removed *${item.name}* from your cart.`
              : action.reply || `Updated *${item.name}* quantity to ${targetQty}.\n\n${formatBillBreakdown(bill)}`,
          updatedCart: newCart,
          newStage: newCart.items.length > 0 ? 'CART_ACTIVE' : 'BROWSING',
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
        await prisma.$transaction(async (tx) => {
          for (const item of currentCart.items) {
            await tx.$executeRaw`
              UPDATE "Product"
              SET reserved = GREATEST(0, reserved - ${item.quantity}), "updatedAt" = NOW()
              WHERE id = ${item.productId}::uuid AND "tenantId" = ${tenantId}::uuid
            `;
          }

          if (currentCart.reservationId) {
            await tx.inventoryReservation.updateMany({
              where: { id: currentCart.reservationId, tenantId, status: 'ACTIVE' },
              data: { status: 'RELEASED' },
            });
          }

          await tx.conversation.update({
            where: { id: conversation.id },
            data: {
              stage: 'BROWSING',
              metadata: {
                ...(conversation.metadata as object),
                cart: { items: [], subtotal: 0 } as any,
              },
            },
          });
        });

        await syncWhatsAppCartToRedis(tenantId, conversation.customerPhone, { items: [], subtotal: 0 });

        return {
          reply: 'Your cart has been cleared. What would you like to explore next?',
          updatedCart: { items: [], subtotal: 0 },
          newStage: 'BROWSING',
        };
      }

      case 'REQUEST_DELIVERY_ADDRESS': {
        const bill = computeBill(currentCart);
        const billText = currentCart.items.length > 0 ? `\n\n${formatBillBreakdown(bill)}` : '';

        // Query saved addresses from relational CustomerAddress
        const phoneClean = conversation.customerPhone.replace(/[^0-9]/g, '');
        const phoneVariants = [
          conversation.customerPhone,
          `+${phoneClean}`,
          phoneClean,
          phoneClean.replace(/^91/, ''),
          `+91${phoneClean.replace(/^91/, '')}`,
          `91${phoneClean.replace(/^91/, '')}`,
        ];

        const dbCust = await prisma.customer.findFirst({
          where: {
            tenantId,
            phone: { in: phoneVariants },
          },
          include: {
            addresses: {
              orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
            },
          },
        });

        const savedAddrs = dbCust?.addresses || [];

        // If customer has multiple saved addresses:
        if (savedAddrs.length > 1) {
          const listText = savedAddrs
            .map((a, idx) => {
              const def = a.isDefault ? ' _(Primary Default)_' : '';
              const line2 = a.line2 ? `, ${a.line2}` : '';
              const landmark = a.landmark ? ` (Near ${a.landmark})` : '';
              return `*${idx + 1}️⃣ [${a.label || 'Destination'}]*${def}\n• *Recipient:* ${a.recipientName} (${a.phone})\n• *Address:* ${a.line1}${line2}${landmark}, ${a.city} - ${a.pincode}`;
            })
            .join('\n\n');

          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              stage: 'CHECKOUT_ADDRESS',
              metadata: {
                ...(conversation.metadata as object),
                savedAddressesChoices: savedAddrs,
              },
            },
          });

          return {
            reply: `📦 *Which delivery address shall we deliver your order to?*\n\n${listText}${billText}\n\n👉 Reply with *1* or *2* (or 'Home'/'Office') to choose, or share a *new delivery address* to deliver elsewhere! 📍`,
            newStage: 'CHECKOUT_ADDRESS',
          };
        }

        let savedAddress: any = null;
        if (savedAddrs.length === 1) {
          const s = savedAddrs[0]!;
          savedAddress = {
            name: s.recipientName,
            phone: s.phone,
            line1: s.line1,
            line2: s.line2,
            landmark: s.landmark,
            city: s.city,
            state: s.state,
            pincode: s.pincode,
            label: s.label,
          };
        } else {
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
          savedAddress =
            preferredAttrs['savedAddress'] ||
            (lastOrderWithAddress?.deliveryAddress as any) ||
            undefined;
        }

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
              customerName: targetAddress.name || targetAddress.recipientName || memory.customerName,
              preferredAttributes: { ...preferredAttrs, savedAddress: targetAddress },
            },
          });
        }

        // Persist to relational Customer & CustomerAddress
        try {
          const phoneClean = conversation.customerPhone.replace(/[^0-9]/g, '');
          const phoneVariants = [
            conversation.customerPhone,
            `+${phoneClean}`,
            phoneClean,
            phoneClean.replace(/^91/, ''),
            `+91${phoneClean.replace(/^91/, '')}`,
            `91${phoneClean.replace(/^91/, '')}`,
          ];

          let dbCust = await prisma.customer.findFirst({
            where: {
              tenantId,
              phone: { in: phoneVariants },
            },
          });

          if (!dbCust) {
            dbCust = await prisma.customer.create({
              data: {
                tenantId,
                phone: conversation.customerPhone,
                name: targetAddress.name || targetAddress.recipientName || null,
              },
            });
          }

          const line1 = targetAddress.line1 || targetAddress.addressLine1 || targetAddress.address || '';
          const pincode = targetAddress.pincode || '';

          if (line1 && pincode) {
            const existingCustAddr = await prisma.customerAddress.findFirst({
              where: {
                customerId: dbCust.id,
                line1,
                pincode,
              },
            });

            if (!existingCustAddr) {
              const hasAnyDefault = await prisma.customerAddress.findFirst({
                where: { customerId: dbCust.id, isDefault: true },
              });

              const createdCustAddr = await prisma.customerAddress.create({
                data: {
                  customerId: dbCust.id,
                  label: targetAddress.label || (hasAnyDefault ? 'Delivery Destination' : 'Home'),
                  recipientName: targetAddress.name || targetAddress.recipientName || dbCust.name || 'Customer',
                  phone: targetAddress.phone || conversation.customerPhone,
                  line1,
                  line2: targetAddress.line2 || targetAddress.addressLine2 || null,
                  landmark: targetAddress.landmark || null,
                  city: targetAddress.city || '',
                  state: targetAddress.state || '',
                  pincode,
                  isDefault: !hasAnyDefault,
                },
              });

              if (!hasAnyDefault) {
                await prisma.customer.update({
                  where: { id: dbCust.id },
                  data: { defaultAddressId: createdCustAddr.id },
                });
              }
            }
          }
        } catch (syncErr: any) {
          console.warn('[ExecutionEngine] Failed to auto-save to CustomerAddress:', syncErr.message);
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
            let isSandboxLink = false;

            if (!paymentUrl) {
              const tenantCfg = await prisma.tenant.findUnique({
                where: { id: tenantId },
                select: { name: true, paymentConfigEncrypted: true },
              });
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
                  description: `Order #${recentPendingOrder.orderNumber} - ${tenantCfg?.name || 'Store'}`,
                },
                platform,
                tenantCfg?.paymentConfigEncrypted
              );
              paymentUrl = routerResult.paymentUrl;
              gatewayName = routerResult.gateway;
              isSandboxLink = Boolean(routerResult.isSandboxMock);

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

            const gatewayTag = isSandboxLink
              ? gatewayName === 'phonepe'
                ? ' _(PhonePe Sandbox)_'
                : ' _(Razorpay Sandbox)_'
              : '';

            return {
              reply: `Here is your secure payment link${gatewayTag} for Order *#${recentPendingOrder.orderNumber}* totaling *₹${Number(recentPendingOrder.total).toFixed(2)}*:\n👉 ${paymentUrl}\n\n💳 UPI (PhonePe, GPay, Paytm), Cards & Netbanking accepted.\n⏳ *Reservation:* Your items are reserved. Please complete payment to confirm your order! ✨`,
            };
          }

          // Check if customer recently completed/paid an order within the last 48 hours
          const recentPaidOrder = await prisma.order.findFirst({
            where: {
              tenantId,
              customerPhone: conversation.customerPhone,
              status: { in: ['PAYMENT_CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] },
            },
            orderBy: { createdAt: 'desc' },
          });

          if (recentPaidOrder) {
            return {
              reply: `Your order *#${recentPaidOrder.orderNumber}* is already confirmed and being prepared for dispatch! ✨\n\nIf you'd like to place a new order or explore more of our collection, just let me know what you're looking for! 🛍️`,
            };
          }

          return {
            reply: 'Your cart is currently empty. Would you like to explore our handcrafted collections to add items to your cart? ✨',
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
          const phoneClean = conversation.customerPhone.replace(/[^0-9]/g, '');
          const phoneVariants = [
            conversation.customerPhone,
            `+${phoneClean}`,
            phoneClean,
            phoneClean.replace(/^91/, ''),
            `+91${phoneClean.replace(/^91/, '')}`,
            `91${phoneClean.replace(/^91/, '')}`,
          ];

          const dbCust = await prisma.customer.findFirst({
            where: {
              tenantId,
              phone: { in: phoneVariants },
            },
            include: {
              addresses: {
                orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
              },
            },
          });

          const savedAddrs = dbCust?.addresses || [];

          if (savedAddrs.length > 1) {
            const listText = savedAddrs
              .map((a, idx) => {
                const def = a.isDefault ? ' _(Primary Default)_' : '';
                const line2 = a.line2 ? `, ${a.line2}` : '';
                const landmark = a.landmark ? ` (Near ${a.landmark})` : '';
                return `*${idx + 1}️⃣ [${a.label || 'Destination'}]*${def}\n• *Recipient:* ${a.recipientName} (${a.phone})\n• *Address:* ${a.line1}${line2}${landmark}, ${a.city} - ${a.pincode}`;
              })
              .join('\n\n');

            await prisma.conversation.update({
              where: { id: conversation.id },
              data: {
                stage: 'CHECKOUT_ADDRESS',
                metadata: {
                  ...meta,
                  savedAddressesChoices: savedAddrs,
                },
              },
            });

            return {
              reply: `📦 *Which delivery address shall we deliver your order to?*\n\n${listText}\n\n${formatBillBreakdown(bill)}\n\n👉 Reply with *1* or *2* (or 'Home'/'Office') to choose, or share a *new delivery address* to deliver elsewhere! 📍`,
              newStage: 'CHECKOUT_ADDRESS',
            };
          }

          let savedAddress: any = null;
          if (savedAddrs.length === 1) {
            const s = savedAddrs[0]!;
            savedAddress = {
              name: s.recipientName,
              phone: s.phone,
              line1: s.line1,
              line2: s.line2,
              landmark: s.landmark,
              city: s.city,
              state: s.state,
              pincode: s.pincode,
              label: s.label,
            };
          } else {
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
            savedAddress =
              preferredAttrs['savedAddress'] ||
              (lastOrderWithAddress?.deliveryAddress as any) ||
              undefined;
          }

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

        const tenantInfo = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true, paymentConfigEncrypted: true },
        });

        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randPart = crypto.randomBytes(3).toString('hex').toUpperCase();
        const orderNumber = `ORD-${datePart}-${randPart}`;

        // Create atomic reservation-linked Order, OrderItems & merged CustomerMemory
        const order = await prisma.$transaction(async (tx) => {
          const reservationExpires = new Date(Date.now() + 15 * 60 * 1000);
          const resItems = currentCart.items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
          }));

          let reservationId: string | undefined;
          if (currentCart.reservationId) {
            const extended = await tx.inventoryReservation.updateMany({
              where: { id: currentCart.reservationId, tenantId, status: 'ACTIVE' },
              data: { items: resItems, expiresAt: reservationExpires },
            });
            if (extended.count === 1) {
              reservationId = currentCart.reservationId;
            }
          }

          if (!reservationId) {
            // Re-reserve atomically in case cart reservation expired before checkout
            for (const item of currentCart.items) {
              const affected = await tx.$executeRaw`
                UPDATE "Product"
                SET reserved = reserved + ${item.quantity}, "updatedAt" = NOW()
                WHERE id = ${item.productId}::uuid
                  AND "tenantId" = ${tenantId}::uuid
                  AND status = 'ACTIVE'
                  AND (stock - reserved) >= ${item.quantity}
              `;
              if (affected !== 1) {
                throw new Error(`OUT_OF_STOCK:${item.name}`);
              }
            }
            const createdRes = await tx.inventoryReservation.create({
              data: {
                tenantId,
                items: resItems,
                expiresAt: reservationExpires,
                status: 'ACTIVE',
              },
            });
            reservationId = createdRes.id;
          }

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
              reservationId,
              deliveryAddress: confirmedAddress as any,
            },
          });

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

          const existingMemory = await tx.customerMemory.findUnique({
            where: {
              tenantId_customerPhone: {
                tenantId,
                customerPhone: conversation.customerPhone,
              },
            },
            select: { preferredAttributes: true },
          });
          const mergedPrefs = {
            ...((existingMemory?.preferredAttributes as Record<string, any>) || {}),
            savedAddress: confirmedAddress,
          };

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
              preferredAttributes: mergedPrefs,
            },
            update: {
              customerName: confirmedAddress?.name || undefined,
              totalOrders: { increment: 1 },
              isRepeatCustomer: true,
              preferredAttributes: mergedPrefs,
            },
          });

          return newOrder;
        });

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
          platform,
          tenantInfo?.paymentConfigEncrypted
        );

        const paymentUrl = routerResult.paymentUrl;

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

        await syncWhatsAppCartToRedis(tenantId, conversation.customerPhone, emptyCart);

        const addressSummary = formatAddress(confirmedAddress);
        const gatewayLabel = routerResult.gateway === 'phonepe'
          ? 'PhonePe' + (routerResult.isSandboxMock ? ' _(Sandbox)_' : '')
          : 'Razorpay' + (routerResult.isSandboxMock ? ' _(Sandbox)_' : '');

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
        const queryCandidate = (action as any).query || (action as any).orderId || '';
        const phoneClean = conversation.customerPhone.replace(/[^0-9]/g, '');
        const phoneVariants = [
          conversation.customerPhone,
          `+${phoneClean}`,
          phoneClean,
          phoneClean.replace(/^91/, ''),
          `+91${phoneClean.replace(/^91/, '')}`,
          `91${phoneClean.replace(/^91/, '')}`,
        ];

        let targetOrder: any = null;

        // 1. Try to find by specific query / AWB / Order Number
        if (queryCandidate) {
          const trimmed = String(queryCandidate).trim();
          const delMatch = trimmed.match(/\b(DEL-\d+)\b/i);
          const ordMatch = trimmed.match(/\b(ORD-[A-Z0-9]+)\b/i);
          const lookupKey = (delMatch && delMatch[1]) ? delMatch[1] : ((ordMatch && ordMatch[1]) ? ordMatch[1] : trimmed);

          targetOrder = await prisma.order.findFirst({
            where: {
              tenantId,
              customerPhone: { in: phoneVariants },
              OR: [
                ...(UUID_REGEX.test(lookupKey) ? [{ id: lookupKey }] : []),
                { orderNumber: { equals: lookupKey, mode: 'insensitive' } },
                { awbCode: { equals: lookupKey, mode: 'insensitive' } },
                { trackingNumber: { equals: lookupKey, mode: 'insensitive' } },
              ],
            },
            include: { items: true, tenant: true },
          });
        }

        // 2. If not found by query, find customer's most recent active or placed order
        if (!targetOrder) {
          targetOrder = await prisma.order.findFirst({
            where: {
              tenantId,
              customerPhone: { in: phoneVariants },
              status: { in: ['SHIPPED', 'PROCESSING', 'PAYMENT_CONFIRMED', 'DELIVERED', 'PENDING_PAYMENT'] },
            },
            orderBy: { createdAt: 'desc' },
            include: { items: true, tenant: true },
          });
        }

        // 3. Fallback to any recent order
        if (!targetOrder) {
          targetOrder = await prisma.order.findFirst({
            where: {
              tenantId,
              customerPhone: { in: phoneVariants },
            },
            orderBy: { createdAt: 'desc' },
            include: { items: true, tenant: true },
          });
        }

        if (!targetOrder) {
          return {
            reply:
              "I couldn't find any active orders associated with your phone number. 📦\n\n" +
              "If you already placed an order with us, please share your *Order Number* (e.g. `ORD-MW7UGM7G`) or *Delhivery AWB* (e.g. `DEL-7759334794`), and I will track it for you right away! ✨",
          };
        }

        // Get unified, real-time ground truth from Delhivery tracking engine
        const trackingInfo = getDelhiveryLiveTrackingStatus(
          targetOrder,
          targetOrder.tenant?.slug || ''
        );

        const reply = formatDelhiveryWhatsAppTrackingReply(trackingInfo);

        return {
          reply,
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
