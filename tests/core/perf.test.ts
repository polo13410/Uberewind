/**
 * Load test on ~50 MB of synthetic CSV. Opt-in (slow): `PERF=1 npm test`.
 */
import { describe, expect, it } from 'vitest';
import { loadExport } from '../../src/core/loadExport';

const enc = new TextEncoder();

function bigTrips(n: number): Uint8Array {
  // Real header has ~90 columns: pad with unused ones so the file size is realistic.
  const pad = Array.from({ length: 70 }, (_, i) => `unused_col_${i}`);
  const header = ['city_name', 'product_type_name', 'currency_code', 'request_timestamp_local', 'begintrip_string', 'destination_string', 'trip_distance_miles', 'trip_duration_seconds', 'status', 'original_fare_local', ...pad].join(',');
  const lines = [header];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2015, 0, 1) + i * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
    lines.push([`City${i % 50}`, i % 2 ? 'uberX' : 'GREEN', 'EUR', d, `${i} Rue A`, `${i} Rue B`, (i % 20) + 0.5, 600 + (i % 900), i % 7 ? 'completed' : 'rider_canceled', (i % 40) + 5.5, ...pad.map(() => 'x')].join(','));
  }
  return enc.encode(lines.join('\n'));
}

function bigEats(n: number): Uint8Array {
  const header = 'City_Name,Restaurant_Name,Request_Time_Local,Final_Delivery_Time_Local,Order_Status,Item_Name,Item_quantity,Customizations,Item_Price,Order_Price,Currency,Order_UUID,Fulfillment_Type,Special_Instructions';
  const lines = [header];
  for (let i = 0; i < n; i++) {
    const order = Math.floor(i / 3);
    const d = new Date(Date.UTC(2018, 0, 1) + order * 1_800_000).toISOString().replace('T', ' ').slice(0, 19);
    lines.push(`Lausanne,Resto ${order % 300},${d},${d},completed,Item ${i % 500},1,"extra cheese, no onions",9.9,29.7,CHF,uuid-${order},DELIVERY,"please ring the bell twice"`);
  }
  return enc.encode(lines.join('\n'));
}

describe.skipIf(!process.env.PERF)('performance (~50 MB)', () => {
  it('parses ~50 MB of CSV in a few seconds', () => {
    const trips = bigTrips(120_000);
    const eats = bigEats(200_000);
    const mb = (trips.length + eats.length) / 1e6;
    const t0 = performance.now();
    const r = loadExport([
      { name: 'rider_lifetime_trips-0.csv', bytes: trips },
      { name: 'eats_order_details-0.csv', bytes: eats },
    ]);
    const ms = performance.now() - t0;
    const resultMb = JSON.stringify(r).length / 1e6;
    console.log(`input ${mb.toFixed(1)} MB → ${ms.toFixed(0)} ms, result ≈ ${resultMb.toFixed(1)} MB`);
    expect(mb).toBeGreaterThan(45);
    expect(r.dataset.trips).toHaveLength(120_000);
    expect(r.dataset.orders!.length).toBeGreaterThan(66_000);
    expect(r.stats!.rides!.products[0].key).toBe('GREEN'); // single variant keeps its case
    expect(ms).toBeLessThan(15_000);
  }, 60_000);
});
