import type { DatasetBuilder } from '../builder';
import type { ParseContext } from '../context';
import { readCsv } from '../csv';
import { parseLocalTimestamp, parseNumber } from '../values';

/** `rider_account_profile_information`: only first name, rating, signup date. */
export function parseProfile(text: string, ctx: ParseContext, b: DatasetBuilder): void {
  const fields = [
    { key: 'firstName', aliases: ['firstname', 'first_name'] },
    { key: 'rating', aliases: ['rating', 'rider_rating'] },
    { key: 'signup', aliases: ['signup_timestamp', 'signup_date', 'created_at'] },
  ] as const;
  let seen = false;
  readCsv<'firstName' | 'rating' | 'signup'>(text, ctx, {
    fields,
    onRow: (row) => {
      if (seen) return;
      seen = true;
      const rating = parseNumber(row.rating).value;
      const signup = parseLocalTimestamp(row.signup);
      b.profile = {
        firstName: row.firstName,
        rating: rating != null && rating > 0 && rating <= 5 ? rating : null,
        signupDate: signup ? signup.slice(0, 10) : null,
      };
    },
  });
}

/** `payment_methods`: only a count per profile type (never card numbers / BIN / bank). */
export function parsePayments(text: string, ctx: ParseContext, b: DatasetBuilder): void {
  const payments = (b.payments ??= {});
  readCsv<'type'>(text, ctx, {
    fields: [{ key: 'type', aliases: ['profile_type', 'payment_type', 'type'] }],
    onRow: (row) => {
      const k = (row.type ?? 'UNKNOWN').toUpperCase();
      payments[k] = (payments[k] ?? 0) + 1;
    },
  });
}

/** `rider_eater_saved_locations`: label + human-readable address (no coordinates). */
export function parseLocations(text: string, ctx: ParseContext, b: DatasetBuilder): void {
  const locations = (b.locations ??= []);
  const fields = [
    { key: 'label', aliases: ['label', 'name', 'tag'] },
    { key: 'number', aliases: ['house_number', 'street_number'] },
    { key: 'street', aliases: ['street_name', 'street', 'address_line_1'] },
    { key: 'address', aliases: ['address', 'formatted_address'], fallback: true },
    { key: 'postal', aliases: ['postal_code', 'zip_code', 'zip'] },
    { key: 'city', aliases: ['city'] },
    { key: 'country', aliases: ['country_code', 'country'] },
  ] as const;
  type K = (typeof fields)[number]['key'];
  readCsv<K>(text, ctx, {
    fields,
    onRow: (row) => {
      const street = [row.number, row.street].filter(Boolean).join(' ');
      const place = [row.postal, row.city].filter(Boolean).join(' ');
      const address = row.address ?? ([street, place, row.country].filter(Boolean).join(', ') || null);
      if (!row.label && !address) return;
      locations.push({ label: row.label ?? 'Sans nom', address: address ?? '—' });
    },
  });
}

/**
 * `customer_support_tickets`: only the number of messages and the date range.
 * The `Message` and `Creator` columns are never resolved, so never read.
 */
export function parseSupport(text: string, ctx: ParseContext, b: DatasetBuilder): void {
  const s = (b.support ??= { messages: 0, first: null, last: null });
  readCsv<'date'>(text, ctx, {
    fields: [{ key: 'date', aliases: ['date', 'created_at', 'timestamp', 'created'] }],
    onRow: (row) => {
      s.messages++;
      const t = parseLocalTimestamp(row.date);
      if (!t) return;
      if (!s.first || t < s.first) s.first = t;
      if (!s.last || t > s.last) s.last = t;
    },
  });
}
