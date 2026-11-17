import { useDeferredValue, useId, useMemo, useState, type ReactNode } from 'react';
import { fmtInt } from '../format';

export interface Column<T> {
  id: string;
  label: string;
  /** Sort key. */
  sortValue: (row: T) => string | number | null;
  /** Text used by the search filter (defaults to the sort value). */
  text?: (row: T) => string;
  render?: (row: T) => ReactNode;
  className?: string;
}

export interface SelectFilter<T> {
  id: string;
  label: string;
  value: (row: T) => string;
  /** Display label for an option value. */
  optionLabel?: (v: string) => string;
}

interface Props<T> {
  caption: string;
  rows: readonly T[];
  columns: Column<T>[];
  filters?: SelectFilter<T>[];
  initialSort?: { id: string; dir: 'asc' | 'desc' };
  pageSize?: number;
}

/**
 * Filterable, sortable table. Rendering is limited to `pageSize` rows with an
 * "Afficher plus" button, which keeps the DOM small for large exports.
 */
export function DataTable<T>({ caption, rows, columns, filters = [], initialSort, pageSize = 200 }: Props<T>) {
  const uid = useId();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(initialSort ?? null);
  const [limit, setLimit] = useState(pageSize);

  const options = useMemo(
    () =>
      Object.fromEntries(
        filters.map((f) => [f.id, [...new Set(rows.map(f.value))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'))]),
      ),
    [filters, rows],
  );

  // Pre-computed lower-case search text per row.
  const haystack = useMemo(
    () => rows.map((r) => columns.map((c) => (c.text ? c.text(r) : String(c.sortValue(r) ?? ''))).join(' \u0001 ').toLowerCase()),
    [rows, columns],
  );

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const active = filters.filter((f) => selected[f.id]);
    let idx = rows.map((_, i) => i);
    if (q) idx = idx.filter((i) => haystack[i].includes(q));
    if (active.length) idx = idx.filter((i) => active.every((f) => f.value(rows[i]) === selected[f.id]));
    if (sort) {
      const col = columns.find((c) => c.id === sort.id);
      if (col) {
        const dir = sort.dir === 'asc' ? 1 : -1;
        const keys = new Map(idx.map((i) => [i, col.sortValue(rows[i])]));
        idx.sort((a, b) => {
          const x = keys.get(a);
          const y = keys.get(b);
          if (x == null && y == null) return 0;
          if (x == null) return 1; // empty values always last
          if (y == null) return -1;
          if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
          return String(x).localeCompare(String(y), 'fr') * dir;
        });
      }
    }
    return idx;
  }, [rows, haystack, deferredQuery, selected, filters, sort, columns]);

  const toggleSort = (id: string) => {
    setSort((s) => (s?.id === id ? { id, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { id, dir: 'desc' }));
  };

  const resetLimit = () => setLimit(pageSize);

  return (
    <div>
      <div className="table-tools">
        <label className="field">
          Rechercher
          <input
            type="search"
            value={query}
            placeholder="Ville, restaurant, adresse…"
            onChange={(e) => {
              setQuery(e.target.value);
              resetLimit();
            }}
          />
        </label>
        {filters.map((f) => (
          <label className="field" key={f.id}>
            {f.label}
            <select
              value={selected[f.id] ?? ''}
              onChange={(e) => {
                setSelected((s) => ({ ...s, [f.id]: e.target.value }));
                resetLimit();
              }}
            >
              <option value="">Tous</option>
              {options[f.id].map((o) => (
                <option key={o} value={o}>
                  {f.optionLabel ? f.optionLabel(o) : o}
                </option>
              ))}
            </select>
          </label>
        ))}
        <span className="table-count" aria-live="polite" id={`${uid}-count`}>
          {fmtInt(visible.length)} / {fmtInt(rows.length)} lignes
        </span>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label={caption}>
        <table aria-describedby={`${uid}-count`}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.id === c.id;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    className={c.className}
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    <button type="button" className="sort" onClick={() => toggleSort(c.id)}>
                      {c.label}
                      <span aria-hidden="true">{active ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, limit).map((i) => {
              const r = rows[i];
              return (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.id} className={c.className}>
                      {c.render ? c.render(r) : String(c.sortValue(r) ?? '—')}
                    </td>
                  ))}
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="empty">
                  Aucun résultat.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {visible.length > limit && (
        <div className="more">
          <button type="button" className="btn" onClick={() => setLimit((l) => l + pageSize)}>
            Afficher {fmtInt(Math.min(pageSize, visible.length - limit))} lignes de plus
          </button>
        </div>
      )}
    </div>
  );
}
