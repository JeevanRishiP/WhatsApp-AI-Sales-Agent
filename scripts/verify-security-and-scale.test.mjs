import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  resolveEncryptionMasterKey,
  encryptTenantSecrets,
  decryptTenantSecrets,
  maskSecret,
} from '../packages/crypto/dist/index.js';
import {
  RazorpayService,
  PhonePeService,
  normalizePaymentUrl,
} from '../packages/payments/dist/index.js';
import {
  matchSavedAddressSelection,
  DEFAULT_FAST_MODELS,
  DEFAULT_ADVANCED_MODELS,
} from '../packages/ai/dist/index.js';
import { CartService } from '../packages/queue/dist/index.js';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');

test('Crypto vault: production rejects unset or default master key', () => {
  const prevEnv = process.env.NODE_ENV;
  const prevMaster = process.env.ENCRYPTION_MASTER_KEY;
  const prevLegacy = process.env.MASTER_ENCRYPTION_KEY;

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.ENCRYPTION_MASTER_KEY;
    delete process.env.MASTER_ENCRYPTION_KEY;

    assert.throws(() => resolveEncryptionMasterKey(), /ENCRYPTION_MASTER_KEY/);

    process.env.ENCRYPTION_MASTER_KEY =
      '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
    assert.throws(() => resolveEncryptionMasterKey(), /non-default/);

    const validKey = 'a'.repeat(64);
    process.env.ENCRYPTION_MASTER_KEY = validKey;
    assert.equal(resolveEncryptionMasterKey(), validKey);
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevMaster === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
    else process.env.ENCRYPTION_MASTER_KEY = prevMaster;
    if (prevLegacy === undefined) delete process.env.MASTER_ENCRYPTION_KEY;
    else process.env.MASTER_ENCRYPTION_KEY = prevLegacy;
  }
});

test('Crypto vault: HKDF per-tenant encryption isolates Tenant A vs Tenant B', () => {
  const tenantA = '11111111-1111-4111-8111-111111111111';
  const tenantB = '22222222-2222-4222-8222-222222222222';
  const secretPayload = {
    razorpayKeyId: 'rzp_live_tenantA_1234',
    razorpayKeySecret: 'super_secret_tenant_a_key',
  };

  const encrypted = encryptTenantSecrets(tenantA, secretPayload);
  assert.ok(typeof encrypted === 'string' && encrypted.length > 20);
  assert.ok(!encrypted.includes('super_secret_tenant_a_key'));

  const decryptedSame = decryptTenantSecrets(tenantA, encrypted);
  assert.deepEqual(decryptedSame, secretPayload);

  assert.throws(() => decryptTenantSecrets(tenantB, encrypted));
  assert.equal(maskSecret('rzp_live_tenantA_1234'), 'rzp_••••1234');
  assert.equal(maskSecret('abc'), '••••••••');
});

test('Payments: Razorpay outage fails closed (no sandbox mock fallback) and verifies constant-time HMAC', async () => {
  const prevSim = process.env.ENABLE_PAYMENT_SIMULATOR;
  const prevNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_PAYMENT_SIMULATOR = 'false';

    const rzp = new RazorpayService({
      keyId: '',
      keySecret: '',
      webhookSecret: 'whsec_test_123456',
    });

    await assert.rejects(
      () =>
        rzp.createPaymentLink({
          amount: 1499,
          currency: 'INR',
          orderId: 'order-uuid-1',
          orderNumber: 'ORD-2026-001',
          customerName: 'Test Buyer',
          customerPhone: '9876543210',
          description: 'Catalog order',
          tenantId: '11111111-1111-4111-8111-111111111111',
        }),
      /credentials|simulator|Razorpay/i
    );

    const body = JSON.stringify({ event: 'payment_link.paid', payload: { id: 'plink_1' } });
    const sig = crypto.createHmac('sha256', 'whsec_test_123456').update(body).digest('hex');

    assert.equal(rzp.verifyWebhookSignature(body, sig), true);
    assert.equal(rzp.verifyWebhookSignature(body, 'deadbeef'), false);
    assert.equal(rzp.verifyWebhookSignature(body + ' ', sig), false);
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
    if (prevSim === undefined) delete process.env.ENABLE_PAYMENT_SIMULATOR;
    else process.env.ENABLE_PAYMENT_SIMULATOR = prevSim;
  }
});

test('Payments: PhonePe checksum verification & normalizePaymentUrl external preservation', () => {
  const phonepe = new PhonePeService({
    merchantId: 'M123',
    saltKey: 'salt-secret-abc',
    saltIndex: 2,
    environment: 'production',
  });

  const base64Payload = Buffer.from(JSON.stringify({ code: 'PAYMENT_SUCCESS' })).toString('base64');
  const expectedDigest = crypto
    .createHash('sha256')
    .update(base64Payload + '/pg/v1/status' + 'salt-secret-abc')
    .digest('hex');
  // PhonePe webhook callback signature covers base64Response + saltKey
  const webhookDigest = crypto
    .createHash('sha256')
    .update(base64Payload + 'salt-secret-abc')
    .digest('hex');

  assert.equal(phonepe.verifyWebhookChecksum(base64Payload, `${webhookDigest}###2`), true);
  assert.equal(phonepe.verifyWebhookChecksum(base64Payload, `${webhookDigest}###1`), false);
  assert.equal(phonepe.verifyWebhookChecksum(base64Payload, 'invalid'), false);
  assert.ok(expectedDigest.length === 64);

  const externalRzp = 'https://rzp.io/i/liveLink123';
  assert.equal(normalizePaymentUrl(externalRzp, { orderId: 'o1' }), externalRzp);

  const externalPhonePe = 'https://mercury-t2.phonepe.com/transact/pg?token=xyz';
  assert.equal(normalizePaymentUrl(externalPhonePe, { orderId: 'o1' }), externalPhonePe);

  const prevBase = process.env.APP_BASE_URL;
  try {
    process.env.APP_BASE_URL = 'https://api.merchant.com';
    assert.equal(
      normalizePaymentUrl('/payments/checkout/order-123', { orderId: 'order-123' }),
      'https://api.merchant.com/payments/checkout/order-123'
    );
  } finally {
    if (prevBase === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = prevBase;
  }
});

test('AI package: regex metacharacters in saved address labels cannot throw or break matching', () => {
  const saved = [
    {
      label: 'Home (2)*+[test]',
      line1: '12 MG Road',
      city: 'Bengaluru',
      pincode: '560001',
    },
    {
      label: 'Office',
      line1: '88 Koramangala',
      city: 'Bengaluru',
      pincode: '560034',
    },
  ];

  const match = matchSavedAddressSelection('Please deliver to my Home (2)*+[test] address', saved);
  assert.equal(match?.label, 'Home (2)*+[test]');
  assert.equal(matchSavedAddressSelection('Deliver to Office', saved)?.label, 'Office');
});

test('AI package: model defaults only use valid production Gemini/OpenAI/Anthropic IDs', () => {
  const all = [...DEFAULT_FAST_MODELS, ...DEFAULT_ADVANCED_MODELS];
  assert.ok(all.some((m) => m.model === 'gemini-2.5-flash'));
  for (const entry of all) {
    assert.ok(!entry.model.startsWith('gemini-3.'), `Invalid model ID: ${entry.model}`);
  }
});

test('Queue CartService: guest cart Redis keys cannot collide with authenticated phone cart keys', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const phoneKey = CartService.getCartKey(tenantId, '+919876543210', 'web');
  const guestSpoofKey = CartService.getCartKey(tenantId, 'guest:+919876543210', 'web');

  assert.notEqual(phoneKey, guestSpoofKey);
  assert.match(phoneKey, /^cart:web:11111111-1111-4111-8111-111111111111:phone:/);
  assert.match(guestSpoofKey, /^cart:web:11111111-1111-4111-8111-111111111111:guest:[0-9a-f]{32}$/);
});

test('API & Worker config: fail closed in production when required secrets are missing', () => {
  const apiConfigPath = path.join(ROOT_DIR, 'apps/api/dist/config.js');
  assert.throws(() => {
    execFileSync(process.execPath, ['-e', `import(${JSON.stringify('file://' + apiConfigPath)})`], {
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/wcos',
      },
      stdio: 'pipe',
    });
  });

  const workerConfigPath = path.join(ROOT_DIR, 'apps/worker/dist/config.js');
  assert.throws(() => {
    execFileSync(process.execPath, ['-e', `import(${JSON.stringify('file://' + workerConfigPath)})`], {
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/wcos',
      },
      stdio: 'pipe',
    });
  });
});

test('AppSec regression scan: hardcoded fallback credentials, Aura defaults, and dead files are absent', () => {
  const forbiddenPatterns = [
    {
      file: 'apps/dashboard/src/app/login/page.tsx',
      pattern: /sk_live_aura_|admin123|aditi@auraluxe\.in/,
    },
    {
      file: 'apps/api/src/routes/webhooks/evolution.ts',
      pattern: /aura_luxe_secret_token_123|11111111-1111-4111-8111-111111111111/,
    },
    {
      file: 'apps/api/src/routes/webhooks/meta.ts',
      pattern: /wcos-meta-verify-token|11111111-1111-4111-8111-111111111111/,
    },
    {
      file: 'apps/dashboard/src/app/(dashboard)/settings/SettingsClient.tsx',
      pattern: /rzp_test_sample|wcos-razorpay-secret|8105845527|9741446186|wa_aura_luxe_01|gemini-3\./,
    },
    {
      file: 'apps/storefront/src/lib/store-service.ts',
      pattern: /AURA_TENANT|AURA_PRODUCTS|aura-data\.json/,
    },
    {
      file: 'apps/dashboard/src/app/(dashboard)/orders/[id]/bill/OrderBillClient.tsx',
      pattern: /29AAACH7409R1ZX|U74999KA2024PTC188201|9063437772|Aura Luxe Fulfillment/,
    },
  ];

  for (const check of forbiddenPatterns) {
    const content = fs.readFileSync(path.join(ROOT_DIR, check.file), 'utf8');
    assert.equal(
      check.pattern.test(content),
      false,
      `Forbidden legacy secret/hardcoding matched in ${check.file}`
    );
  }

  assert.equal(fs.existsSync(path.join(ROOT_DIR, 'apps/worker/src/processors/inbound.ts')), false);
  assert.equal(fs.existsSync(path.join(ROOT_DIR, 'apps/worker/src/cart/cart-service.ts')), false);
});
