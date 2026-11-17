import type { DatasetBuilder } from '../builder';
import type { ParseContext } from '../context';
import { readCsv } from '../csv';
import { parseNumber } from '../values';

const FIELDS = [{ key: 'stars', aliases: ['five_star_rating', 'rating', 'stars'] }] as const;

export function parseRatings(text: string, ctx: ParseContext, b: DatasetBuilder): void {
  const ratings = (b.ratings ??= {});
  let invalid = 0;
  const { aborted } = readCsv<'stars'>(text, ctx, {
    fields: FIELDS,
    onRow: (row) => {
      if (row.stars == null) return;
      const n = parseNumber(row.stars).value;
      if (n == null || n < 1 || n > 5) {
        invalid++;
        return;
      }
      const k = String(Math.round(n));
      ratings[k] = (ratings[k] ?? 0) + 1;
    },
  });
  if (!aborted && invalid) ctx.warn('warning', `${invalid} note(s) invalide(s) ignorée(s).`);
}
