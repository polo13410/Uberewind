import { describe, expect, it } from 'vitest';
import {
  buildLabelCanonicalizer,
  normalizeHeader,
  normalizeStatus,
  parseLocalTimestamp,
  parseNumber,
  partIndex,
  secondsBetween,
  timeParts,
} from '../../src/core/values';

describe('parseNumber', () => {
  it.each([
    ['6.47', 6.47],
    ['6,47', 6.47],
    ['1 234,50', 1234.5],
    ['1,234.50', 1234.5],
    ['1.234,50', 1234.5],
    ['CHF 12.5', 12.5],
    ['-3', -3],
    ['3.25860587299273', 3.25860587299273],
  ])('%s → %s', (input, expected) => {
    expect(parseNumber(input)).toEqual({ value: expected, invalid: false });
  });

  it.each(['', '  ', 'NaN', 'null', String.raw`\N`, 'N/A', undefined, null])('empty-ish %s → null, not invalid', (v) => {
    expect(parseNumber(v as string)).toEqual({ value: null, invalid: false });
  });

  it.each(['abc', '12abc34', '1.2.3', 'Infinity', '--4'])('garbage %s → null, invalid', (v) => {
    expect(parseNumber(v)).toEqual({ value: null, invalid: true });
  });
});

describe('parseLocalTimestamp', () => {
  it('keeps local wall-clock time without timezone conversion', () => {
    expect(parseLocalTimestamp('2020-03-15 02:23:20')).toBe('2020-03-15 02:23:20');
    expect(parseLocalTimestamp('2018-07-22T18:45:43.000Z')).toBe('2018-07-22 18:45:43');
    expect(parseLocalTimestamp('2019-05-12 18:33:01 +0000 UTC')).toBe('2019-05-12 18:33:01');
    expect(parseLocalTimestamp('2021-1-2 3:04')).toBe('2021-01-02 03:04:00');
    expect(parseLocalTimestamp('2021-01-02')).toBe('2021-01-02 00:00:00');
  });
  it('rejects invalid values', () => {
    for (const v of ['', 'not a date', '2021-13-01 00:00:00', '2021-01-01 25:00:00', '1800-01-01', null]) {
      expect(parseLocalTimestamp(v)).toBeNull();
    }
  });
});

describe('timeParts / secondsBetween', () => {
  it('computes weekday with Monday = 0', () => {
    expect(timeParts('2024-01-01 10:00:00')).toEqual({ year: 2024, month: 1, weekday: 0, hour: 10 }); // Monday
    expect(timeParts('2023-05-07 23:59:00').weekday).toBe(6); // Sunday
  });
  it('computes durations', () => {
    expect(secondsBetween('2024-01-01 10:00:00', '2024-01-01 10:12:30')).toBe(750);
    expect(secondsBetween('2024-01-01 10:00:00', null)).toBeNull();
    expect(secondsBetween('2024-01-02 10:00:00', '2024-01-01 10:00:00')).toBeNull();
  });
});

describe('labels & headers', () => {
  it('groups Green / GREEN / " green " under one non-all-caps label', () => {
    const canon = buildLabelCanonicalizer(['GREEN', 'Green', 'GREEN', ' green ', 'uberX', 'UberXL']);
    expect(canon('GREEN')).toBe('Green');
    expect(canon(' green ')).toBe('Green');
    expect(canon('uberX')).toBe('uberX');
    expect(canon('UberXL')).toBe('UberXL');
    expect(canon(null)).toBeNull();
  });
  it('keeps ALL CAPS when it is the only variant', () => {
    expect(buildLabelCanonicalizer(['DELIVERY'])('DELIVERY')).toBe('DELIVERY');
  });
  it('normalizes headers', () => {
    expect(normalizeHeader('\uFEFFOrder_UUID')).toBe('order_uuid');
    expect(normalizeHeader(' Distance (miles) ')).toBe('distance_miles');
    expect(normalizeStatus('Rider Canceled')).toBe('rider_canceled');
    expect(normalizeStatus(null)).toBe('unknown');
  });
  it('reads part indexes of split files', () => {
    expect(partIndex('rider_lifetime_trips-0.csv')).toBe(0);
    expect(partIndex('rider_lifetime_trips-12.csv')).toBe(12);
    expect(partIndex('rider_eater_saved_locations.csv')).toBe(0);
  });
});
