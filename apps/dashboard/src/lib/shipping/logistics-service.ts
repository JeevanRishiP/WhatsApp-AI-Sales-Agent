// ╔═══════════════════════════════════════════════════════════════╗
// ║  Logistics & Delivery Partner Service — Delhivery Express     ║
// ║  Handles Delhivery Virtual AWB, Sandbox Consignment,         ║
// ║  Code 128 Barcode & QR Code SVG rendering, and Tracking.     ║
// ║  (DTDC deactivated/disabled for testing phase)               ║
// ╚═══════════════════════════════════════════════════════════════╝

import QRCode from 'qrcode';
import {
  generateDelhiveryAwb,
  computeDelhiveryMilestones,
  type CourierPartner as SharedCourierPartner,
  type DelhiveryMilestone,
} from '@wcos/types';

export type CourierPartner = 'DELHIVERY';

export interface ConsignmentItem {
  productName: string;
  productCode: string;
  quantity: number;
  price: number;
}

export interface ConsignmentCreationInput {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: {
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    landmark?: string;
  };
  courierPartner?: 'DELHIVERY' | 'DTDC' | string;
  items: ConsignmentItem[];
  totalAmount: number;
  paymentMethod: string;
  storeSlug?: string;
  storeName?: string;
  staffName?: string;
}

export type TrackingMilestone = DelhiveryMilestone;

export interface ConsignmentResult {
  courierPartner: 'DELHIVERY';
  courierName: string;
  awbCode: string;
  trackingUrl: string;
  courierPortalUrl: string;
  dispatchedAt: string;
  estimatedDeliveryDate: string;
  barcodeSvg: string;
  qrCodeSvg: string;
  trackingEvents: TrackingMilestone[];
  isSandbox: boolean;
}

// ─── Code 128 Barcode Generator (Pure SVG) ──────────────────────

// Code 128 Code-B patterns (bar widths from 1 to 4)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', // 100-102
  '211412', // 104: Start Code B
  '211214', // 105: Start Code C
  '2331112' // 106: Stop
];

export function generateBarcodeSvg(text: string, height = 48): string {
  // Use Code 128-B encoding
  const startCodeB = 104;
  let checksum = startCodeB;
  const indices: number[] = [startCodeB];

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    // ASCII 32 (' ') to 126 ('~') maps to value 0 to 94
    const value = charCode >= 32 && charCode <= 126 ? charCode - 32 : 0;
    indices.push(value);
    checksum += value * (i + 1);
  }

  const checksumIndex = checksum % 103;
  indices.push(checksumIndex);
  indices.push(106); // Stop pattern

  // Convert width strings to bar/space sequences
  let totalModules = 0;
  const bars: Array<{ x: number; width: number }> = [];
  let currentX = 10; // Left quiet zone

  for (const idx of indices) {
    const pattern = CODE128_PATTERNS[idx] || CODE128_PATTERNS[0];
    for (let p = 0; p < pattern.length; p++) {
      const w = parseInt(pattern[p], 10);
      const isBar = p % 2 === 0;
      if (isBar) {
        bars.push({ x: currentX, width: w * 2 });
      }
      currentX += w * 2;
    }
  }

  totalModules = currentX + 10; // Right quiet zone
  const rects = bars
    .map((b) => `<rect x="${b.x}" y="0" width="${b.width}" height="${height}" fill="#0f172a" />`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${height}" width="100%" height="${height}" preserveAspectRatio="none">${rects}</svg>`;
}

// ─── Pure SVG QR Code Generator ─────────────────────────────────

export async function generateQrCodeSvg(url: string, size = 120): Promise<string> {
  try {
    const svgString = await QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      width: size,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
    return svgString;
  } catch (err) {
    // Fallback placeholder SVG
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f8fafc"/><text x="50" y="55" font-size="10" text-anchor="middle" fill="#64748b">QR Code</text></svg>`;
  }
}

// ─── AWB Generator (Delhivery Virtual Tracking ID) ───────────────

export function generateAwbNumber(
  _courier?: any,
  seedString?: string
): string {
  // DTDC disabled: Always use Delhivery Virtual Tracking ID
  return generateDelhiveryAwb(seedString);
}

// ─── Tracking Milestones Generator ──────────────────────────────

export function generateMilestones(
  _courier?: any,
  awbCode: string = '',
  city: string = '',
  dispatchedDate: Date = new Date(),
  storeName: string = 'Fulfillment Hub'
): TrackingMilestone[] {
  // Compute realistic chronological milestones for Delhivery Express
  const result = computeDelhiveryMilestones({
    awbCode,
    city: city || 'Dispatch Hub',
    dispatchedDate,
    orderStatus: 'SHIPPED',
    storeName,
  });
  return result.milestones;
}

// ─── Register Consignment (Delhivery Sandbox & Live Ready) ───────

export async function createConsignment(input: ConsignmentCreationInput): Promise<ConsignmentResult> {
  // DTDC is disabled for testing phase. Always enforce Delhivery Express.
  const courier: CourierPartner = 'DELHIVERY';
  const courierName = 'Delhivery Express';

  const seed = `${input.orderNumber}-${input.customerPhone}-${Date.now()}`;
  const awbCode = generateDelhiveryAwb(seed);
  const now = new Date();

  const city = input.deliveryAddress?.city || 'Destination City';

  // Base URL for storefront customer tracking
  const storefrontBase = (
    process.env['NEXT_PUBLIC_STOREFRONT_URL'] ||
    process.env['STOREFRONT_URL'] ||
    'http://localhost:3005'
  ).replace(/\/$/, '');

  const slug = (input.storeSlug || '').replace(/^\/+|\/+$/g, '');
  const trackingUrl = slug
    ? `${storefrontBase}/${slug}/track?awb=${awbCode}`
    : `${storefrontBase}/track?awb=${awbCode}`;
  const courierPortalUrl = `https://www.delhivery.com/track/package/${awbCode.replace('DEL-', '')}`;

  // Generate barcodes and QR codes
  const barcodeSvg = generateBarcodeSvg(awbCode, 44);
  const qrCodeSvg = await generateQrCodeSvg(trackingUrl, 130);

  const hubName = input.storeName ? `${input.storeName} Fulfillment Hub` : 'Fulfillment Hub';
  const calc = computeDelhiveryMilestones({
    awbCode,
    city,
    dispatchedDate: now,
    orderStatus: 'SHIPPED',
    storeName: hubName,
  });

  return {
    courierPartner: courier,
    courierName,
    awbCode,
    trackingUrl,
    courierPortalUrl,
    dispatchedAt: now.toISOString(),
    estimatedDeliveryDate: calc.expectedDeliveryDate,
    barcodeSvg,
    qrCodeSvg,
    trackingEvents: calc.milestones,
    isSandbox: true,
  };
}
