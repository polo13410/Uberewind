import type { MoneyItem } from '../core/types';

const nf = new Map<string, Intl.NumberFormat>();
function numberFormat(min: number, max: number): Intl.NumberFormat {
  const k = `${min}-${max}`;
  let f = nf.get(k);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max });
    nf.set(k, f);
  }
  return f;
}

export const fmtInt = (n: number) => numberFormat(0, 0).format(n);
export const fmtNum = (n: number, digits = 1) => numberFormat(0, digits).format(n);

/** Currencies whose amounts are customarily shown without decimals. */
const NO_DECIMALS = new Set(['COP', 'CLP', 'JPY', 'KRW', 'HUF', 'IDR', 'VND', 'PYG', 'ISK', 'UGX']);

export function fmtMoney(amount: number, currency: string): string {
  const d = NO_DECIMALS.has(currency) ? 0 : 2;
  return `${numberFormat(d, d).format(amount)} ${currency}`;
}

/** Compact axis ticks: 1 200 → "1,2 k". */
export function fmtAxis(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${fmtNum(n / 1_000_000, 1)} M`;
  if (Math.abs(n) >= 10_000) return `${fmtNum(n / 1000, 0)} k`;
  return fmtNum(n, 1);
}

export const moneyList = (items: readonly MoneyItem[]) => items.map((m) => fmtMoney(m.amount, m.currency));

/** `2020-03-15 02:23:20` → `15/03/2020 02:23` */
export function fmtDateTime(t: string | null): string {
  if (!t) return '—';
  return `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)} ${t.slice(11, 16)}`;
}

/** `2020-03-15…` → `15/03/2020` */
export function fmtDate(t: string | null): string {
  if (!t) return '—';
  return `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}`;
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** `2024-03` → `mars 24` */
export const fmtMonthShort = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(2, 4)}`;
/** `2024-03` → `mars 2024` */
export const fmtMonthLong = (ym: string) => `${MONTHS_LONG[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`;
/** `2018-07-22` → `22 juillet 2018` */
export const fmtDateLong = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS_LONG[Number(d.slice(5, 7)) - 1] ?? ''} ${d.slice(0, 4)}`;

export const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const WEEKDAYS_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

const TRIP_STATUS: Record<string, string> = {
  completed: 'Terminée',
  rider_canceled: 'Annulée par vous',
  driver_canceled: 'Annulée par le chauffeur',
  canceled: 'Annulée',
  unfulfilled: 'Non aboutie',
  failed: 'Échouée',
  unknown: 'Inconnu',
};

const ORDER_STATUS: Record<string, string> = {
  completed: 'Livrée',
  canceled: 'Annulée',
  cancelled: 'Annulée',
  unfulfilled: 'Non aboutie',
  failed: 'Échouée',
  unknown: 'Inconnu',
};

const humanize = (s: string) => {
  const t = s.replace(/_/g, ' ').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const tripStatusLabel = (s: string) => TRIP_STATUS[s] ?? humanize(s);
export const orderStatusLabel = (s: string) => ORDER_STATUS[s] ?? humanize(s);

/** Visual tone of a status tag (always paired with its text label). */
export function statusTone(s: string): 'ok' | 'warn' | 'err' | '' {
  if (s === 'completed') return 'ok';
  if (/cancel/.test(s)) return 'warn';
  if (/unfulfilled|fail/.test(s)) return 'err';
  return '';
}

const FULFILLMENT: Record<string, string> = {
  DELIVERY: 'Livraison',
  DELIVERY_THIRD_PARTY: 'Livraison par le restaurant',
  DELIVERY_OVER_THE_TOP: 'Livraison par le restaurant',
  PICKUP: 'À emporter',
  DINE_IN: 'Sur place',
};
export const fulfillmentLabel = (s: string) => FULFILLMENT[s.toUpperCase()] ?? humanize(s);

const PAYMENT: Record<string, string> = {
  BANK_CARD: 'Carte bancaire',
  PAYPAL: 'PayPal',
  APPLE_PAY: 'Apple Pay',
  APPLE_PAY_DISPLAY: 'Apple Pay (affichage)',
  GOOGLE_PAY: 'Google Pay',
  ANDROID_PAY: 'Google Pay',
  UBER_PAY: 'Uber Pay',
  STORED_VALUE: 'Solde Uber / carte cadeau',
  UBER_CASH: 'Uber Cash',
  CASH: 'Espèces',
  VENMO: 'Venmo',
  PAYTM: 'Paytm',
  UNKNOWN: 'Inconnu',
};
export const paymentLabel = (s: string) => PAYMENT[s.toUpperCase()] ?? humanize(s);

export const plural = (n: number, one: string, many: string) => `${fmtInt(n)} ${n > 1 ? many : one}`;
