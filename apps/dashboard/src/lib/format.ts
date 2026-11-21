// ╔═══════════════════════════════════════════════════════════════╗
// ║  Deterministic Format Helpers                                  ║
// ║                                                               ║
// ║  Next.js SSR vs Browser hydration mismatch protection.         ║
// ║  Guarantees 100% identical strings on Node.js and browsers.   ║
// ╚═══════════════════════════════════════════════════════════════╝

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Deterministic date-time formatter: outputs identical strings on server (Node.js) and client (browsers).
 * Example output: "8 Nov, 06:34 pm"
 */
export function formatDateTime(dateInput: string | Date | number | null | undefined): string {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '—';

  const day = d.getDate();
  const month = MONTHS_SHORT[d.getMonth()];
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  const hour12 = (hours === 0 ? 12 : hours).toString().padStart(2, '0');

  return `${day} ${month}, ${hour12}:${minutes} ${ampm}`;
}

/**
 * Deterministic date with year formatter.
 * Example output: "08 Nov 2026"
 */
export function formatDate(dateInput: string | Date | number | null | undefined): string {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '—';

  const day = d.getDate().toString().padStart(2, '0');
  const month = MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear();

  return `${day} ${month} ${year}`;
}

/**
 * Deterministic short date formatter.
 * Example output: "8 Nov"
 */
export function formatDateShort(dateInput: string | Date | number | null | undefined): string {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '—';

  const day = d.getDate();
  const month = MONTHS_SHORT[d.getMonth()];
  return `${day} ${month}`;
}

/**
 * Deterministic time formatter.
 * Example output: "06:34 pm"
 */
export function formatTime(dateInput: string | Date | number | null | undefined): string {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '—';

  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  const hour12 = (hours === 0 ? 12 : hours).toString().padStart(2, '0');

  return `${hour12}:${minutes} ${ampm}`;
}

/**
 * Formats a currency number with Indian Rupee grouping.
 * Example: 20400 -> "₹20,400"
 */
export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) return '₹0';
  const num = Math.round(Number(amount));
  return `₹${num.toLocaleString('en-IN')}`;
}
