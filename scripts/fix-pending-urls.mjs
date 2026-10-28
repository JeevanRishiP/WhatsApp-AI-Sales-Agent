#!/usr/bin/env node
/**
 * Updates all PENDING_PAYMENT orders to use the current APP_BASE_URL
 * instead of whatever was stored (old localhost or old tunnel URL).
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse APP_BASE_URL from root .env
const envPath = resolve(__dirname, '../.env');
const envContent = readFileSync(envPath, 'utf8');
const match = envContent.match(/^APP_BASE_URL=["']?([^"'\n]+)["']?/m);
const appBaseUrl = match ? match[1].trim() : 'http://localhost:3002';
console.log(`\n🔧  Using APP_BASE_URL: ${appBaseUrl}\n`);

const prisma = new PrismaClient();

const orders = await prisma.order.findMany({
  where: { status: 'PENDING_PAYMENT' },
  select: { id: true, orderNumber: true, trackingUrl: true },
});

console.log(`Found ${orders.length} PENDING_PAYMENT order(s)`);

for (const order of orders) {
  if (!order.trackingUrl) {
    console.log(`  ⏭  ${order.orderNumber} — no trackingUrl, skipping`);
    continue;
  }

  let newUrl = order.trackingUrl;
  try {
    const url = new URL(order.trackingUrl);
    newUrl = `${appBaseUrl}${url.pathname}${url.search}`;
  } catch {
    // Not a valid URL — leave as-is
  }

  if (newUrl === order.trackingUrl) {
    console.log(`  ✅  ${order.orderNumber} — already correct: ${newUrl}`);
  } else {
    await prisma.order.update({
      where: { id: order.id },
      data: { trackingUrl: newUrl },
    });
    console.log(`  🔄  ${order.orderNumber}`);
    console.log(`      OLD: ${order.trackingUrl}`);
    console.log(`      NEW: ${newUrl}`);
  }
}

await prisma.$disconnect();
console.log('\n✅  Done.\n');
