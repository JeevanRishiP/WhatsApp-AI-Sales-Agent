import { getRedisCacheConnection } from './connection.js';
import {
  type Cart,
  type CartItem,
  type CartChannel,
  type DualCart,
} from '@wcos/types';
import crypto from 'node:crypto';

const CART_TTL_SECONDS = 72 * 3600; // 72 hours
const MAX_ITEM_QTY = 50;

export class CartService {
  private static normalizeIdentifier(identifier: string): {
    displayId: string;
    keySegment: string;
  } {
    if (identifier.startsWith('guest:')) {
      const rawGuest = identifier.slice('guest:'.length).trim();
      const digest = crypto.createHash('sha256').update(rawGuest).digest('hex').slice(0, 32);
      return {
        displayId: `guest:${digest}`,
        keySegment: `guest:${digest}`,
      };
    }

    const digits = identifier.replace(/[^0-9]/g, '');
    return {
      displayId: digits,
      keySegment: `phone:${digits}`,
    };
  }

  public static getCartKey(
    tenantId: string,
    identifier: string,
    channel: CartChannel = 'wa'
  ): string {
    const { keySegment } = this.normalizeIdentifier(identifier);
    return `cart:${channel}:${tenantId}:${keySegment}`;
  }

  private static getLegacyCartKey(tenantId: string, identifier: string): string {
    const digits = identifier.replace(/[^0-9]/g, '');
    return `cart:${tenantId}:${digits}`;
  }

  /**
   * Retrieves a specific channel's cart (WhatsApp or Web).
   */
  static async getCart(
    tenantId: string,
    identifier: string,
    channel: CartChannel = 'wa'
  ): Promise<Cart> {
    const redis = getRedisCacheConnection();
    const key = this.getCartKey(tenantId, identifier, channel);
    let data = await redis.get(key);

    // Backward compatibility only for authenticated phone WhatsApp carts
    if (!data && channel === 'wa' && !identifier.startsWith('guest:')) {
      const legacyKey = this.getLegacyCartKey(tenantId, identifier);
      const legacyData = await redis.get(legacyKey);
      if (legacyData) {
        data = legacyData;
        await redis.set(key, legacyData, 'EX', CART_TTL_SECONDS);
        await redis.del(legacyKey);
      }
    }

    const { displayId } = this.normalizeIdentifier(identifier);

    if (data) {
      try {
        const parsed = JSON.parse(data);
        return {
          ...parsed,
          channel,
          items: (parsed.items || []).map((i: any) => ({
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
      customerPhone: displayId,
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
   * Retrieves both WhatsApp and Web carts simultaneously for authenticated customers.
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
  static async saveCart(cart: Cart, rawIdentifier?: string): Promise<void> {
    const redis = getRedisCacheConnection();
    const key = this.getCartKey(
      cart.tenantId,
      rawIdentifier || cart.customerPhone,
      cart.channel || 'wa'
    );
    cart.lastActivityAt = new Date();
    cart.expiresAt = new Date(Date.now() + CART_TTL_SECONDS * 1000);

    await redis.set(key, JSON.stringify(cart), 'EX', CART_TTL_SECONDS);
  }

  /**
   * Adds an item to a specific channel's cart with positive integer validation.
   */
  static async addItem(
    tenantId: string,
    identifier: string,
    product: { id: string; code: string; name: string; price: number; imageUrl?: string },
    quantity: number = 1,
    channel: CartChannel = 'wa'
  ): Promise<Cart> {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QTY) {
      throw new Error(`Quantity must be an integer between 1 and ${MAX_ITEM_QTY}`);
    }

    const cart = await this.getCart(tenantId, identifier, channel);
    const existingItem = cart.items.find(
      (i) => i.productCode.toLowerCase() === product.code.toLowerCase()
    );

    if (existingItem) {
      const nextQty = existingItem.quantity + quantity;
      if (nextQty > MAX_ITEM_QTY) {
        throw new Error(`Maximum ${MAX_ITEM_QTY} units allowed per item`);
      }
      existingItem.quantity = nextQty;
      existingItem.priceAtAdd = Number(product.price);
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
    await this.saveCart(cart, identifier);
    return cart;
  }

  /**
   * Removes an item by product code from a specific channel's cart.
   */
  static async removeItem(
    tenantId: string,
    identifier: string,
    productCode: string,
    channel: CartChannel = 'wa'
  ): Promise<Cart> {
    const cart = await this.getCart(tenantId, identifier, channel);
    cart.items = cart.items.filter(
      (i) => i.productCode.toLowerCase() !== productCode.toLowerCase()
    );
    this.recalculate(cart);
    await this.saveCart(cart, identifier);
    return cart;
  }

  /**
   * Updates quantity of a specific item in a channel's cart.
   */
  static async updateQuantity(
    tenantId: string,
    identifier: string,
    productCode: string,
    quantity: number,
    channel: CartChannel = 'wa'
  ): Promise<Cart> {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_ITEM_QTY) {
      throw new Error(`Quantity must be an integer between 0 and ${MAX_ITEM_QTY}`);
    }
    const cart = await this.getCart(tenantId, identifier, channel);
    if (quantity === 0) {
      return this.removeItem(tenantId, identifier, productCode, channel);
    }

    const item = cart.items.find(
      (i) => i.productCode.toLowerCase() === productCode.toLowerCase()
    );
    if (item) {
      item.quantity = quantity;
      this.recalculate(cart);
      await this.saveCart(cart, identifier);
    }
    return cart;
  }

  /**
   * Clears a specific cart.
   */
  static async clearCart(
    tenantId: string,
    identifier: string,
    channel: CartChannel = 'wa'
  ): Promise<void> {
    const redis = getRedisCacheConnection();
    const key = this.getCartKey(tenantId, identifier, channel);
    await redis.del(key);
  }

  /**
   * Merges all items from sourceChannel into targetChannel.
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
      const match = targetCart.items.find(
        (i) => i.productCode.toLowerCase() === srcItem.productCode.toLowerCase()
      );
      if (match) {
        match.quantity = Math.min(MAX_ITEM_QTY, match.quantity + srcItem.quantity);
      } else {
        targetCart.items.push({
          ...srcItem,
          source: srcItem.source,
          addedAt: new Date(),
        });
      }
    }

    this.recalculate(targetCart);
    await this.saveCart(targetCart, customerPhone);
    await this.clearCart(tenantId, customerPhone, sourceChannel);

    return targetCart;
  }

  private static recalculate(cart: Cart): void {
    cart.itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    const rawSubtotal = cart.items.reduce(
      (sum, item) => sum + item.priceAtAdd * item.quantity,
      0
    );
    cart.subtotal = Number(rawSubtotal.toFixed(2));
  }

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
