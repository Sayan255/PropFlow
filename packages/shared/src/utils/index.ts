/** Pure helpers shared across apps: formatting, phone masking, money, time. */

export const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '•••••';
  return `${digits.slice(0, 5)} •••${digits.slice(-2)}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Money is stored as integer paisa (1/100 ₹) to avoid float issues. */
export function toCents(rupees: number): number {
  return Math.round(rupees * 100);
}
export function fromCents(cents: number): number {
  return cents / 100;
}

/** 15000000 paisa → "₹15 Lakh"; 12000000000 paisa → "₹1.2 Crore". */
export function formatINR(paisa: number): string {
  const rupees = paisa / 100;
  const abs = Math.abs(rupees);
  const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
  if (abs >= 10_000_000) {
    const cr = rupees / 10_000_000;
    return `₹${trimZeros(cr.toFixed(2))} Crore`;
  }
  if (abs >= 100_000) {
    const lakh = rupees / 100_000;
    return `₹${trimZeros(lakh.toFixed(2))} Lakh`;
  }
  if (abs >= 1000) return `₹${fmt.format(Math.round(rupees))}`;
  return `₹${fmt.format(rupees)}`;
}

/** "15.00" → "15"; "1.20" → "1.2"; "1.25" → "1.25" (only strips trailing zeros). */
function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

export function pricePerSqftRupees(pricePaisa: number, areaSqft: number): number {
  if (!areaSqft || areaSqft <= 0) return 0;
  return Math.round(pricePaisa / 100 / areaSqft);
}

/** IST is UTC+05:30 year-round (no DST). */
export const IST_OFFSET_MINUTES = 330;

/** Convert a wall-clock IST datetime to the correct UTC Date. */
export function istToUtc(isoLocal: string): Date {
  const naive = isoLocal.replace(' ', 'T').replace(/Z$|[+-]\d{2}:\d{2}$/, '');
  const asUtc = new Date(`${naive}Z`);
  return new Date(asUtc.getTime() - IST_OFFSET_MINUTES * 60_000);
}

/** Format a UTC date for display in a given IANA timezone. */
export function formatInZone(date: Date | string, timeZone: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(d);
}
