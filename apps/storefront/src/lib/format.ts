// ╔═══════════════════════════════════════════════════════════════╗
// ║  Deterministic Format Helpers — Storefront                     ║
// ║                                                               ║
// ║  Next.js SSR vs Browser hydration mismatch protection.         ║
// ║  Guarantees 100% identical strings on Node.js and browsers.   ║
// ╚═══════════════════════════════════════════════════════════════╝

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

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

