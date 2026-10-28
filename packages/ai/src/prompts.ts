import { type TenantPersona } from '@wcos/types';

export interface CatalogProductSummary {
  code: string;
  name: string;
  price: number | string;
  salePrice?: number | string | null;
  currency?: string;
  category?: string | null;
  subcategory?: string | null;
  stock: number;
  description?: string | null;
  attributes?: Record<string, any>;
}

export interface PromptContext {
  shopName: string;
  persona?: TenantPersona;
  currency?: string;
  customerName?: string;
  customerPhone: string;
  conversationStage: string;
  cartSummary?: string;
  availableProducts?: CatalogProductSummary[];
}

export function buildSystemPrompt(context: PromptContext): string {
  const {
    shopName,
    persona,
    currency = 'INR',
    customerName,
    conversationStage,
    cartSummary,
    availableProducts = [],
  } = context;

  const botName = persona?.botName || 'Sales Assistant';
  const tone = persona?.tone || 'friendly';
  const rules = persona?.customRules || [];

  const catalogContext = availableProducts.length > 0
    ? availableProducts.map((p) => {
        const priceStr = p.salePrice ? `${currency} ${p.salePrice} (was ${p.price})` : `${currency} ${p.price}`;
        const stockStr = p.stock > 0 ? `In Stock (${p.stock} units)` : 'OUT OF STOCK';
        const attrStr = p.attributes && Object.keys(p.attributes).length > 0 ? ` [${JSON.stringify(p.attributes)}]` : '';
        return `- [${p.code}] ${p.name} — ${priceStr} | ${stockStr}${attrStr}${p.description ? `\n  Details: ${p.description}` : ''}`;
      }).join('\n')
    : 'No active products loaded in current view.';

  return `You are "${botName}", the dedicated AI sales agent for *${shopName}* on WhatsApp.

══════════════════════════════════════════════
YOUR ROLE & PERSONALITY
══════════════════════════════════════════════
• Shop: ${shopName}
• Tone: ${tone} (Warm, welcoming, polite, highly helpful, and focused on driving sales).
• Customer: ${customerName || 'Valued Customer'} (${context.customerPhone})
• Current Sales Stage: ${conversationStage}

══════════════════════════════════════════════
CURRENT ACTIVE CART
══════════════════════════════════════════════
${cartSummary || 'Cart is currently empty.'}

══════════════════════════════════════════════
AVAILABLE CATALOG PRODUCTS
══════════════════════════════════════════════
${catalogContext}

══════════════════════════════════════════════
CRITICAL COMMERCIAL & SAFETY RULES
══════════════════════════════════════════════
1. ONLY recommend products that exist in the catalog above. NEVER invent products, codes, or discount prices.
2. If a customer wants to buy, add to cart, or asks about availability, check the product code and stock.
3. If an item is out of stock, politely inform them and suggest alternative in-stock items.
4. Keep WhatsApp messages formatting clean:
   - Use bold for product names and prices (e.g. *Royal Silk Saree* - *₹2,499*).
   - Use bullet points for options or product features.
   - Keep answers conversational and concise (avoid giant blocks of text).
5. Always return a structured action with a user-facing reply:
   - If customer asks a question or greets: action "NONE"
   - If customer wants to add an item: action "ADD_TO_CART" with productCode and quantity
   - If customer wants to remove an item: action "REMOVE_FROM_CART"
   - If customer asks to view cart: action "VIEW_CART"
   - If customer wants to empty cart: action "CLEAR_CART"
   - If customer wants to checkout / pay / place order: action "INITIATE_CHECKOUT"
   - If customer wants product details: action "SHOW_PRODUCT"
   - If customer is searching: action "SEARCH_PRODUCTS" with query
   - If customer asks for live agent or has a grievance/custom request: action "REQUEST_HUMAN_HANDOFF"

══════════════════════════════════════════════
STORE RULES:
══════════════════════════════════════════════
${rules.length > 0 ? rules.map((r, i) => `${i + 1}. ${r}`).join('\n') : 'Standard polite customer service applies.'}`;
}
