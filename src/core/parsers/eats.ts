import type { DatasetBuilder, EatsLine } from '../builder';
import type { ParseContext } from '../context';
import { readCsv, type FieldSpec } from '../csv';
import type { EatsOrder } from '../types';
import { normalizeCurrency, normalizeStatus, parseLocalTimestamp, parseNumber } from '../values';

const FIELDS = [
  { key: 'city', aliases: ['city_name', 'city'] },
  { key: 'restaurant', aliases: ['restaurant_name', 'store_name', 'restaurant'] },
  { key: 'request', aliases: ['request_time_local', 'request_timestamp_local', 'order_time', 'request_time'] },
  { key: 'delivered', aliases: ['final_delivery_time_local', 'delivery_time_local', 'final_delivery_time'] },
  { key: 'status', aliases: ['order_status', 'status'] },
  { key: 'item', aliases: ['item_name'] },
  { key: 'qty', aliases: ['item_quantity', 'quantity'] },
  { key: 'orderPrice', aliases: ['order_price', 'order_total', 'total_price'] },
  { key: 'currency', aliases: ['currency', 'currency_code'] },
  { key: 'uuid', aliases: ['order_uuid', 'order_id', 'workflow_uuid'] },
  { key: 'fulfillment', aliases: ['fulfillment_type', 'delivery_type'] },
] as const satisfies readonly FieldSpec[];

type Key = (typeof FIELDS)[number]['key'];

export function parseEatsOrders(text: string, ctx: ParseContext, b: DatasetBuilder): void {
  const lines = (b.eatsLines ??= []);
  let noDate = 0;
  let badNumbers = 0;
  let hasUuid = true;

  const { rows, aborted } = readCsv<Key>(text, ctx, {
    fields: FIELDS,
    onHeader: (r) => {
      if (!r.has('request')) {
        ctx.warn('error', 'Colonne Request_Time_Local absente : fichier ignoré.');
        return false;
      }
      hasUuid = r.has('uuid');
      if (!hasUuid) ctx.warn('warning', 'Colonne Order_UUID absente : commandes regroupées par date + restaurant.');
      return true;
    },
    onRow: (row) => {
      const t = parseLocalTimestamp(row.request);
      if (!t) {
        noDate++;
        return;
      }
      const qty = parseNumber(row.qty);
      const price = parseNumber(row.orderPrice);
      badNumbers += [qty, price].filter((n) => n.invalid).length;
      lines.push({
        groupKey: row.uuid ?? `${row.request ?? t}|${row.restaurant ?? ''}`,
        t,
        deliveredAt: parseLocalTimestamp(row.delivered),
        city: row.city,
        restaurant: row.restaurant,
        status: normalizeStatus(row.status),
        currency: normalizeCurrency(row.currency),
        orderPrice: price.value,
        fulfillment: row.fulfillment,
        item: row.item ? { name: row.item, qty: qty.value != null && qty.value > 0 ? qty.value : 1 } : null,
      });
    },
  });

  if (aborted) return;
  if (noDate) ctx.warn('warning', `${noDate} ligne(s) ignorée(s) sur ${rows} : date illisible.`);
  if (badNumbers) ctx.warn('warning', `${badNumbers} valeur(s) numérique(s) invalide(s) laissée(s) vides.`);
}

/**
 * One CSV line per article → one EatsOrder per Order_UUID.
 * `Order_Price` is the order total repeated on every line: take it once
 * (first non-null), never sum it. Order-level fields come from the first line.
 */
export function groupEatsLines(lines: readonly EatsLine[]): EatsOrder[] {
  const byKey = new Map<string, EatsOrder>();
  for (const l of lines) {
    let o = byKey.get(l.groupKey);
    if (!o) {
      o = {
        id: byKey.size,
        t: l.t,
        deliveredAt: l.deliveredAt,
        city: l.city,
        restaurant: l.restaurant,
        status: l.status,
        currency: l.currency,
        price: l.orderPrice,
        fulfillment: l.fulfillment,
        items: [],
        lineCount: 0,
      };
      byKey.set(l.groupKey, o);
    } else {
      o.price ??= l.orderPrice;
      o.currency ??= l.currency;
      o.deliveredAt ??= l.deliveredAt;
      o.city ??= l.city;
      o.restaurant ??= l.restaurant;
      o.fulfillment ??= l.fulfillment;
    }
    o.lineCount++;
    if (l.item) o.items.push(l.item);
  }
  return [...byKey.values()];
}
