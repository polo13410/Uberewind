import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { loadExport } from '../../src/core/loadExport';
import { classify } from '../../src/core/registry';
import { fixture, utf8 } from './helpers';

const msgs = (r: ReturnType<typeof loadExport>, file?: string) =>
  r.warnings.filter((w) => !file || w.file === file).map((w) => w.message);

describe('file detection', () => {
  it('recognises files by base name, whatever the folder', () => {
    expect(classify('rider_lifetime_trips-0.csv')).toMatchObject({ kind: 'spec', spec: { id: 'trips' } });
    expect(classify('RIDER_LIFETIME_TRIPS-3.csv')).toMatchObject({ kind: 'spec', spec: { id: 'trips' } });
    expect(classify('trips_data.csv')).toMatchObject({ kind: 'spec', spec: { id: 'trips' } });
    expect(classify('eats_order_details-0.csv')).toMatchObject({ kind: 'spec', spec: { id: 'eats' } });
    expect(classify('rider_eater_saved_locations.csv')).toMatchObject({ kind: 'spec', spec: { id: 'locations' } });
    expect(classify('eats_app_analytics-0.csv').kind).toBe('ignored');
    expect(classify('communications_from_uber-0.csv').kind).toBe('ignored');
    expect(classify('driver_lifetime_trips-0.csv').kind).toBe('unknown');
  });
});

describe('trips', () => {
  const r = loadExport([fixture('trips_basic.csv', 'Rider/rider_lifetime_trips-0.csv')]);
  const trips = r.dataset.trips!;

  it('skips rows without a usable date and warns', () => {
    expect(trips).toHaveLength(4);
    expect(msgs(r, 'rider_lifetime_trips-0.csv').join(' ')).toMatch(/1 ligne\(s\) ignorée\(s\) sur 5 : date illisible/);
  });

  it('normalises Green / GREEN / " green " into one product', () => {
    expect(r.stats!.rides!.products).toEqual([
      { key: 'Green', count: 3 },
      { key: 'uberX', count: 1 },
    ]);
  });

  it('converts miles to km and tolerates invalid numbers', () => {
    const t = trips.find((x) => x.t === '2023-05-01 08:10:00')!;
    expect(t.km).toBeCloseTo(16.09344, 5);
    expect(t.fare).toBe(25.5);
    expect(trips.find((x) => x.t === '2023-05-02 09:00:00')!.fare).toBe(12.4); // "12,40"
    const bad = trips.find((x) => x.t === '2024-02-03 18:00:00')!;
    expect(bad.km).toBeNull();
    expect(bad.fare).toBeNull();
    expect(bad.durationSec).toBe(600); // computed from begin/dropoff when duration is NaN
    expect(msgs(r).join(' ')).toMatch(/valeur\(s\) numérique\(s\) invalide/);
  });

  it('aggregates completed trips only for km / spend', () => {
    const s = r.stats!.rides!;
    expect(s.total).toBe(4);
    expect(s.completed).toBe(3);
    expect(s.riderCanceled).toBe(1);
    expect(s.km).toBeCloseTo(15 * 1.609344, 5);
    expect(s.spend).toEqual([{ currency: 'EUR', amount: 37.9, count: 2 }]);
  });

  it('tolerates missing optional columns', () => {
    const r2 = loadExport([fixture('trips_missing_columns.csv', 'rider_lifetime_trips-0.csv')]);
    expect(r2.dataset.trips).toHaveLength(2);
    expect(r2.dataset.trips![0]).toMatchObject({ km: null, fare: null, product: null, currency: null });
    expect(msgs(r2).join(' ')).toMatch(/Colonnes absentes/);
    expect(r2.stats!.rides!.km).toBe(0);
  });

  it('skips a file with no date column, with an error warning', () => {
    const r3 = loadExport([fixture('trips_no_date.csv', 'rider_lifetime_trips-0.csv')]);
    expect(r3.warnings.some((w) => w.level === 'error' && /Aucune colonne de date/.test(w.message))).toBe(true);
    expect(r3.dataset.trips).toEqual([]);
  });

  it('concatenates split files (-0, -1)', () => {
    const r4 = loadExport([
      fixture('trips_missing_columns.csv', 'a/rider_lifetime_trips-1.csv'),
      fixture('trips_basic.csv', 'b/rider_lifetime_trips-0.csv'),
    ]);
    expect(r4.dataset.trips).toHaveLength(6);
    expect(r4.filesRead).toEqual(['rider_lifetime_trips-0.csv', 'rider_lifetime_trips-1.csv']);
  });

  it('accepts headers in another case, with BOM', () => {
    const csv = '﻿City_Name,Request_Timestamp_Local,STATUS\nBern,2020-01-01 10:00:00,COMPLETED\n';
    const r5 = loadExport([{ name: 'rider_lifetime_trips-0.csv', bytes: utf8(csv) }]);
    expect(r5.dataset.trips![0]).toMatchObject({ city: 'Bern', status: 'completed' });
  });
});

describe('eats', () => {
  const r = loadExport([fixture('eats_multiline.csv', 'Eats/eats_order_details-0.csv')]);
  const orders = r.dataset.orders!;

  it('groups article lines by Order_UUID', () => {
    expect(orders).toHaveLength(3); // uuid-4 has no date → skipped
    const o = orders.find((x) => x.restaurant === 'Pizza Roma')!;
    expect(o.lineCount).toBe(3);
    expect(o.items).toEqual([
      { name: 'Margherita', qty: 2 },
      { name: 'Tiramisu', qty: 1 },
      { name: 'Coca', qty: 1 },
    ]);
  });

  it('never sums the repeated Order_Price', () => {
    expect(orders.find((x) => x.restaurant === 'Pizza Roma')!.price).toBe(42.9);
    const s = r.stats!.eats!;
    expect(s.spend).toEqual([
      { currency: 'CHF', amount: 42.9, count: 1 },
      { currency: 'EUR', amount: 24, count: 1 },
    ]);
  });

  it('computes completed/failed counts, item lines and monthly spend per currency', () => {
    const s = r.stats!.eats!;
    expect(s.orders).toBe(3);
    expect(s.completed).toBe(2);
    expect(s.failed).toBe(1);
    expect(s.itemLines).toBe(4);
    expect(s.byMonth.map((m) => m.month)).toEqual(['2024-03', '2024-04', '2024-05']);
    expect(s.byMonth[0]).toMatchObject({ CHF: 42.9, EUR: 0 });
    expect(s.topItems[0]).toEqual({ key: 'Maki', count: 3 });
    expect(s.fulfillment.map((f) => f.key).sort()).toEqual(['DELIVERY', 'DELIVERY_THIRD_PARTY', 'PICKUP']);
  });

  it('never keeps special instructions', () => {
    expect(JSON.stringify(r)).not.toContain('ring twice');
  });

  it('falls back to date + restaurant grouping without Order_UUID', () => {
    const csv =
      'Restaurant_Name,Request_Time_Local,Item_Name,Order_Price,Currency,Order_Status\n' +
      'A,2024-01-01 12:00:00,x,10,EUR,completed\nA,2024-01-01 12:00:00,y,10,EUR,completed\n';
    const r2 = loadExport([{ name: 'eats_order_details-0.csv', bytes: utf8(csv) }]);
    expect(r2.dataset.orders).toHaveLength(1);
    expect(r2.dataset.orders![0].price).toBe(10);
    expect(msgs(r2).join(' ')).toMatch(/Order_UUID absente/);
  });
});

describe('account files', () => {
  const r = loadExport([
    fixture('sensitive_profile.csv', 'rider_account_profile_information-0.csv'),
    fixture('sensitive_payments.csv', 'payment_methods-0.csv'),
    fixture('support.csv', 'customer_support_tickets-0.csv'),
    fixture('locations.csv', 'rider_eater_saved_locations.csv'),
    fixture('ratings.csv', 'rider_lifetime_ratings_received-0.csv'),
  ]);

  it('reads only the allowed profile fields', () => {
    expect(r.dataset.profile).toEqual({ firstName: 'Alex', rating: 4.9, signupDate: '2019-06-01' });
  });

  it('counts payment methods per profile type', () => {
    expect(r.dataset.payments).toEqual({ BANK_CARD: 2, PAYPAL: 1 });
  });

  it('keeps only the number and dates of support messages (multi-line messages included)', () => {
    expect(r.dataset.support).toEqual({ messages: 3, first: '2021-01-02 10:00:00', last: '2022-08-13 07:18:22' });
  });

  it('builds readable addresses without coordinates', () => {
    expect(r.dataset.locations).toEqual([
      { label: 'home', address: '12 Rue du Lac, 1003 Lausanne, CH' },
      { label: 'work', address: '75002 Paris, FR' },
    ]);
  });

  it('counts ratings and ignores invalid ones', () => {
    expect(r.dataset.ratings).toEqual({ '5': 2, '4': 1, '3': 1 });
    expect(r.stats!.rides!.ratingAvg).toBeCloseTo(4.25);
  });

  it('PRIVACY: no sensitive value survives parsing', () => {
    const json = JSON.stringify(r);
    for (const secret of [
      'SECRET_LASTNAME',
      'secret@example.com',
      '+41790000000',
      '411111',
      '4111111111111111',
      '5555555555554444',
      'SECRET_BANK',
      'SECRET_MESSAGE',
      'Agent Bob',
      'secret.example',
      '46.51',
      '6.63',
    ]) {
      expect(json, secret).not.toContain(secret);
    }
  });
});

describe('zip & robustness', () => {
  it('reads a zip, skips ignored files without inflating them, lists unknown files', () => {
    const zip = zipSync({
      'Uber Data/Rider/rider_lifetime_trips-0.csv': strToU8(
        'city_name,request_timestamp_local,status\nNice,2021-06-01 10:00:00,completed\n',
      ),
      'Uber Data/Eats/eats_app_analytics-0.csv': strToU8('msg.eats_app.device.ip_address\n10.0.0.1\n'),
      'Uber Data/Driver/driver_lifetime_trips-0.csv': strToU8('a\n1\n'),
      'Uber Data/readme.html': strToU8('<p>hi</p>'),
      '__MACOSX/._rider_lifetime_trips-0.csv': strToU8('junk'),
    });
    const r = loadExport([{ name: 'export.zip', bytes: zip }]);
    expect(r.dataset.trips).toHaveLength(1);
    expect(r.filesRead).toEqual(['rider_lifetime_trips-0.csv']);
    expect(JSON.stringify(r)).not.toContain('10.0.0.1');
    expect(msgs(r, 'eats_app_analytics-0.csv')[0]).toMatch(/ignoré volontairement/);
    expect(msgs(r, 'driver_lifetime_trips-0.csv')[0]).toMatch(/non reconnu/);
  });

  it('never throws on garbage input', () => {
    const garbage = new Uint8Array(Array.from({ length: 2000 }, (_, i) => (i * 7919) % 256));
    const cases = [
      [{ name: 'broken.zip', bytes: garbage }],
      [{ name: 'rider_lifetime_trips-0.csv', bytes: garbage }],
      [{ name: 'eats_order_details-0.csv', bytes: new Uint8Array() }],
      [{ name: 'payment_methods-0.csv', bytes: utf8('"unterminated,quote\n1,2') }],
      [{ name: 'random.txt', bytes: utf8('hello') }],
      [],
    ];
    for (const inputs of cases) {
      const r = loadExport(inputs);
      expect(r.warnings.length).toBeGreaterThan(0);
      expect(r.stats).not.toBeNull();
    }
    const zipR = loadExport([{ name: 'broken.zip', bytes: garbage }]);
    expect(zipR.warnings.some((w) => /Archive zip illisible/.test(w.message))).toBe(true);
  });

  it('warns about broken encoding (U+FFFD / Latin-1 bytes)', () => {
    const csv = new Uint8Array([
      ...utf8('Label,City\nZürich,X\n'),
      // "C\xE9cile,Y": a Latin-1 byte inside an otherwise UTF-8 file
      0x43, 0xe9, 0x63, 0x69, 0x6c, 0x65, 0x2c, 0x59, 0x0a,
    ]);
    const r = loadExport([{ name: 'rider_eater_saved_locations.csv', bytes: csv }]);
    expect(r.dataset.locations!.map((l) => l.label)).toEqual(['Zürich', 'C�cile']);
    expect(msgs(r).join(' ')).toMatch(/Encodage imparfait : 1 caractère/);
  });

  it('reports missing expected files as info', () => {
    const r = loadExport([fixture('ratings.csv', 'rider_lifetime_ratings_received-0.csv')]);
    expect(r.dataset.trips).toBeNull();
    expect(r.dataset.orders).toBeNull();
    expect(msgs(r).join(' ')).toMatch(/Aucun fichier Uber Eats/);
    expect(r.stats!.eats).toBeNull();
  });
});
