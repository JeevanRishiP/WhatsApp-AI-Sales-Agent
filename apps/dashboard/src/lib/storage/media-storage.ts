import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface UploadProductMediaParams {
  tenantId: string;
  productId: string;
  buffer: Buffer;
  mimeType: string;
  originalFilename: string;
}

export interface UploadMediaResult {
  url: string;
  storageProvider: 'r2' | 'local';
  key: string;
}

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']);

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function resolveSafeExt(filename: string, mimeType: string): string {
  const fromName = filename.split('.').pop()?.toLowerCase() || '';
  if (ALLOWED_EXTENSIONS.has(fromName)) return fromName;
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/avif') return 'avif';
  return 'jpg';
}

export async function uploadProductMedia(
  params: UploadProductMediaParams
): Promise<UploadMediaResult> {
  const { tenantId, productId, buffer, mimeType, originalFilename } = params;
  const safeExt = resolveSafeExt(originalFilename, mimeType);
  const randomId = crypto.randomBytes(6).toString('hex');
  const filename = `item-${productId.slice(0, 8)}-${Date.now()}-${randomId}.${safeExt}`;
  const objectKey = `tenants/${tenantId}/products/${productId}/${filename}`;

  const r2AccountId = process.env['R2_ACCOUNT_ID']?.trim();
  const endpoint = (
    process.env['S3_ENDPOINT']?.trim() ||
    (r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : '')
  ).replace(/\/$/, '');
  const bucket = (process.env['R2_BUCKET'] || process.env['S3_BUCKET'] || '').trim();
  const accessKeyId = (
    process.env['R2_ACCESS_KEY_ID'] ||
    process.env['S3_ACCESS_KEY_ID'] ||
    ''
  ).trim();
  const secretAccessKey = (
    process.env['R2_SECRET_ACCESS_KEY'] ||
    process.env['S3_SECRET_ACCESS_KEY'] ||
    ''
  ).trim();
  const publicBaseUrl = (
    process.env['R2_PUBLIC_URL'] ||
    process.env['S3_PUBLIC_URL'] ||
    ''
  )
    .trim()
    .replace(/\/$/, '');
  const region = (process.env['S3_REGION'] || 'auto').trim();

  if (endpoint && bucket && accessKeyId && secretAccessKey) {
    const parsedEndpoint = new URL(endpoint);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256Hex(buffer);
    const canonicalUri = `/${bucket}/${objectKey}`;
    const canonicalHeaders =
      `content-type:${mimeType}\n` +
      `host:${parsedEndpoint.host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [
      'PUT',
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = hmacSha256(kDate, region);
    const kService = hmacSha256(kRegion, 's3');
    const kSigning = hmacSha256(kService, 'aws4_request');
    const signature = crypto
      .createHmac('sha256', kSigning)
      .update(stringToSign, 'utf8')
      .digest('hex');

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const uploadUrl = `${endpoint}${canonicalUri}`;
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        Authorization: authorization,
      },
      body: new Uint8Array(buffer),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Object storage upload failed (${res.status}): ${errText.slice(0, 200)}`);
    }

    const publicUrl = publicBaseUrl
      ? `${publicBaseUrl}/${objectKey}`
      : `${endpoint}/${bucket}/${objectKey}`;

    return {
      url: publicUrl,
      storageProvider: 'r2',
      key: objectKey,
    };
  }

  if (process.env['NODE_ENV'] === 'production' && process.env['ALLOW_LOCAL_UPLOADS'] !== 'true') {
    throw new Error(
      'Durable object storage (R2/S3 credentials) must be configured in production when ALLOW_LOCAL_UPLOADS is not enabled.'
    );
  }

  const uploadDir = path.resolve(process.cwd(), 'public', 'uploads', 'products', tenantId);
  await fs.promises.mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, filename);
  await fs.promises.writeFile(filePath, buffer);

  return {
    url: `/api/media/products/${tenantId}/${filename}`,
    storageProvider: 'local',
    key: `products/${tenantId}/${filename}`,
  };
}

export async function deleteLocalProductMedia(
  tenantId: string,
  targetUrl: string
): Promise<void> {
  if (targetUrl.startsWith(`/api/media/products/${tenantId}/`)) {
    const filename = path.basename(targetUrl);
    const tenantDir = path.resolve(process.cwd(), 'public', 'uploads', 'products', tenantId);
    const filePath = path.resolve(tenantDir, filename);
    if (filePath.startsWith(tenantDir + path.sep)) {
      await fs.promises.unlink(filePath).catch(() => {});
    }
    return;
  }

  if (targetUrl.startsWith('/uploads/products/')) {
    const filename = path.basename(targetUrl);
    const uploadDir = path.resolve(process.cwd(), 'public', 'uploads', 'products');
    const filePath = path.resolve(uploadDir, filename);
    if (filePath.startsWith(uploadDir + path.sep)) {
      await fs.promises.unlink(filePath).catch(() => {});
    }
  }
}
