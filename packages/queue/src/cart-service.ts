import { getRedisConnection } from './connection.js';
import {
  type Cart,
  type CartItem,
  type CartChannel,
  type DualCart,
} from '@wcos/types';
import crypto from 'node:crypto';

const CART_TTL_SECONDS = 72 * 3600; // 72 hours

export class CartService {
  private static cleanPhone(phone: string): string {
    return phone.replace(/[^0-9]/g, '');
  }

  public static getCartKey(tenantId: string, customerPhone: string, channel: CartChannel = 'wa'): string {
    const phone = this.cleanPhone(customerPhone);
    return `cart:${channel}:${tenantId}:${phone}`;
  }

  private static getLegacyCartKey(tenantId: string, customerPhone: string): string {
    const phone = this.cleanPhone(customerPhone);
    return `cart:${tenantId}:${phone}`;
  }

  /**
   * Retrieves a specific channel's cart (WhatsApp or Web).
   */
  static async getCart(tenantId: string, customerPhone: string, channel: CartChannel = 'wa'): Promise<Cart> {
    const redis = getRedisConnection();
    const key = this.getCartKey(tenantId, customerPhone, channel);
    let data = await redis.get(key);

    // Backward compatibility for legacy WhatsApp carts stored without channel prefix
    if (!data && channel === 'wa') {
      const legacyKey = this.getLegacyCartKey(tenantId, customerPhone);
      const legacyData = await redis.get(legacyKey);
      if (legacyData) {
        data = legacyData;
        // Migrate to channel-scoped key
        await redis.set(key, legacyData, 'EX', CART_TTL_SECONDS);
        await redis.del(legacyKey);
      }
    }

    if (data) {
      try {
        const parsed = JSON.parse(data);
        return {
          ...parsed,
          channel,
          items: parsed.items.map((i: any) => ({
            ...i,
            source: i.source || (channel === 'wa' ? 'whatsapp' : 'web'),
            addedAt: new Date(i.addedAt),
          })),
          lastActivityAt: new Date(parsed.lastActivityAt),
          expiresAt: new Date(parsed.expiresAt),
          createdAt: new Date(parsed.createdAt),
        };
      } catch {
        // Fallback to fresh cart if corrupted
      }
    }

    const now = new Date();
    return {
      id: crypto.randomUUID(),
      tenantId,
      customerPhone: this.cleanPhone(customerPhone),
      channel,
      items: [],
      subtotal: 0,
      currency: 'INR',
      itemCount: 0,
      createdAt: now,
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + CART_TTL_SECONDS * 1000),
    };
  }

  /**
   * Retrieves both WhatsApp and Web carts simultaneously for omnichannel views.
   */
  static async getDualCart(tenantId: string, customerPhone: string): Promise<DualCart> {
    const [waCart, webCart] = await Promise.all([
      this.getCart(tenantId, customerPhone, 'wa'),
      this.getCart(tenantId, customerPhone, 'web'),
    ]);

    const totalItemCount = waCart.itemCount + webCart.itemCount;
    const combinedSubtotal = Number((waCart.subtotal + webCart.subtotal).toFixed(2));

    return {
      waCart,
      webCart,
      totalItemCount,
      combinedSubtotal,
    };
  }

  /**
   * Saves cart state back to Redis with sliding TTL.
   */
  static async saveCart(cart: Cart): Promise<void> {
    const redis = getRedisConnection();
    const key = this.getCartKey(cart.tenantId, cart.customerPhone, cart.channel || 'wa');
    cart.lastActivityAt = new Date();
    cart.expiresAt = new Date(Date.now() + CART_TTL_SECONDS * 1000);

    await redis.set(key, JSON.stringify(cart), 'EX', CART_TTL_SECONDS);
  }

  /**
   * Adds an item to a specific channel's cart.
   */
  static async addItem(
    tenantId: string,
    customerPhone: string,
    product: { id: string; code: string; name: string; price: number; imageUrl?: string },
    quantity: number = 1,
    channel: CartChannel = 'wa'
  ): Promise<Cart> {
    const cart = await this.getCart(tenantId, customerPhone, channel);
    const existingItem = cart.items.find((i) => i.productCode.toLowerCase() === product.code.toLowerCase());

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      const newItem: CartItem = {
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        quantity,
        priceAtAdd: Number(product.price),
        imageUrl: product.imageUrl,
        source: channel === 'wa' ? 'whatsapp' : 'web',
        addedAt: new Date(),
      };
      cart.items.push(newItem);
    }

    this.recalculate(cart);
    await this.saveCart(cart);
    return cart;
  }

  /**
   * Removes an item by product code from a specific channel's cart.
   */
  static async removeItem(
    tenantId: string,
    customerPhone: string,
    productCode: string,
    channel: CartChannel = 'wa'
  ): Promise<Cart> {
    const cart = await this.getCart(tenantId, customerPhone, channel);
    cart.items = cart.items.filter((i) => i.productCode.toLowerCase() !== productCode.toLowerCase());
    this.recalculate(cart);
    await this.saveCart(cart);
    return cart;
  }

  /**
   * Updates quantity of a specific item in a channel's cart.
   */
  static async updateQuantity(
    tenantId: string,
    customerPhone: string,
    productCode: string,
    quantity: number,
    channel: CartChannel = 'wa'
  ): Promise<Cart> {
    const cart = await this.getCart(tenantId, customerPhone, channel);
    if (quantity <= 0) {
      return this.removeItem(tenantId, customerPhone, productCode, channel);
    }

    const item = cart.items.find((i) => i.productCode.toLowerCase() === productCode.toLowerCase());
    if (item) {
      item.quantity = quantity;
      this.recalculate(cart);
      await this.saveCart(cart);
    }
    return cart;
  }

  /**
   * Clears a specific cart.
   */
  static async clearCart(tenantId: string, customerPhone: string, channel: CartChannel = 'wa'): Promise<void> {
    const redis = getRedisConnection();
    const key = this.getCartKey(tenantId, customerPhone, channel);
    await redis.del(key);
  }

  /**
   * Merges all items from a source channel cart into a target channel cart (e.g. WhatsApp cart into Web cart).
   * After merging, clears the source cart to avoid duplicate ordering.
   */
  static async mergeCarts(
    tenantId: string,
    customerPhone: string,
    sourceChannel: CartChannel,
    targetChannel: CartChannel
  ): Promise<Cart> {
    if (sourceChannel === targetChannel) {
      return this.getCart(tenantId, customerPhone, targetChannel);
    }

    const [sourceCart, targetCart] = await Promise.all([
      this.getCart(tenantId, customerPhone, sourceChannel),
      this.getCart(tenantId, customerPhone, targetChannel),
    ]);

    for (const srcItem of sourceCart.items) {
      const match = targetCart.items.find((i) => i.productCode.toLowerCase() === srcItem.productCode.toLowerCase());
      if (match) {
        match.quantity += srcItem.quantity;
      } else {
        targetCart.items.push({
          ...srcItem,
          source: srcItem.source,
          addedAt: new Date(),
        });
      }
    }

    this.recalculate(targetCart);
    await this.saveCart(targetCart);
    await this.clearCart(tenantId, customerPhone, sourceChannel);

    return targetCart;
  }

  /**
   * Helper to recalculate subtotal and itemCount.
   */
  private static recalculate(cart: Cart): void {
    cart.itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    const rawSubtotal = cart.items.reduce((sum, item) => sum + item.priceAtAdd * item.quantity, 0);
    cart.subtotal = Number(rawSubtotal.toFixed(2));
  }

  /**
   * Formats a cart into a clean, luxury WhatsApp markdown summary.
   */
  static formatCartSummary(cart: Cart): string {
    if (cart.items.length === 0) {
      return '🛒 *Your Cart is Empty*';
    }

    const lines = cart.items.map((item, idx) => {
      const itemTotal = (item.priceAtAdd * item.quantity).toFixed(2);
      return `${idx + 1}. *${item.productName}* [${item.productCode}]\n   Qty: ${item.quantity} × ${cart.currency} ${item.priceAtAdd} = *${cart.currency} ${itemTotal}*`;
    });

    return `🛒 *Your Shopping Cart* (${cart.itemCount} items):\n\n${lines.join('\n\n')}\n\n*Total Amount:* *${cart.currency} ${cart.subtotal.toFixed(2)}*`;
  }
}
