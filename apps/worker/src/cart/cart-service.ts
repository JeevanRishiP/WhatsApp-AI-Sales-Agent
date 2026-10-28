import { getRedisConnection } from '@wcos/queue';
import { type Cart, type CartItem } from '@wcos/types';
import crypto from 'node:crypto';

const CART_TTL_SECONDS = 72 * 3600; // 72 hours

export class CartService {
  private static getCartKey(tenantId: string, customerPhone: string): string {
    return `cart:${tenantId}:${customerPhone}`;
  }

  static async getCart(tenantId: string, customerPhone: string): Promise<Cart> {
    const redis = getRedisConnection();
    const key = this.getCartKey(tenantId, customerPhone);
    const data = await redis.get(key);

    if (data) {
      try {
        const parsed = JSON.parse(data);
        return {
          ...parsed,
          items: parsed.items.map((i: any) => ({
            ...i,
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
      customerPhone,
      items: [],
      subtotal: 0,
      currency: 'INR',
      itemCount: 0,
      createdAt: now,
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + CART_TTL_SECONDS * 1000),
    };
  }

  static async saveCart(cart: Cart): Promise<void> {
    const redis = getRedisConnection();
    const key = this.getCartKey(cart.tenantId, cart.customerPhone);
    cart.lastActivityAt = new Date();
    cart.expiresAt = new Date(Date.now() + CART_TTL_SECONDS * 1000);

    await redis.set(key, JSON.stringify(cart), 'EX', CART_TTL_SECONDS);
  }

  static async addItem(
    tenantId: string,
    customerPhone: string,
    product: { id: string; code: string; name: string; price: number; imageUrl?: string },
    quantity: number = 1
  ): Promise<Cart> {
    const cart = await this.getCart(tenantId, customerPhone);
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
        addedAt: new Date(),
      };
      cart.items.push(newItem);
    }

    this.recalculate(cart);
    await this.saveCart(cart);
    return cart;
  }

  static async removeItem(tenantId: string, customerPhone: string, productCode: string): Promise<Cart> {
    const cart = await this.getCart(tenantId, customerPhone);
    cart.items = cart.items.filter((i) => i.productCode.toLowerCase() !== productCode.toLowerCase());
    this.recalculate(cart);
    await this.saveCart(cart);
    return cart;
  }

  static async updateQuantity(
    tenantId: string,
    customerPhone: string,
    productCode: string,
    quantity: number
  ): Promise<Cart> {
    const cart = await this.getCart(tenantId, customerPhone);
    const item = cart.items.find((i) => i.productCode.toLowerCase() === productCode.toLowerCase());
    if (item) {
      if (quantity <= 0) {
        return this.removeItem(tenantId, customerPhone, productCode);
      }
      item.quantity = quantity;
      this.recalculate(cart);
      await this.saveCart(cart);
    }
    return cart;
  }

  static async clearCart(tenantId: string, customerPhone: string): Promise<void> {
    const redis = getRedisConnection();
    const key = this.getCartKey(tenantId, customerPhone);
    await redis.del(key);
  }

  private static recalculate(cart: Cart) {
    let subtotal = 0;
    let itemCount = 0;

    for (const item of cart.items) {
      subtotal += item.priceAtAdd * item.quantity;
      itemCount += item.quantity;
    }

    cart.subtotal = Number(subtotal.toFixed(2));
    cart.itemCount = itemCount;
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
