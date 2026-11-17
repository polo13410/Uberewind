import type { ReactNode } from 'react';

export interface Kpi {
  label: string;
  /** One value, or several lines (e.g. one per currency). */
  value: ReactNode | string[];
  hint?: string;
}

export function Kpis({ items }: { items: Kpi[] }) {
  return (
    <dl className="kpis">
      {items.map((k) => (
        <div className="kpi" key={k.label}>
          <dt>{k.label}</dt>
          <dd>
            {Array.isArray(k.value) ? (
              k.value.length ? (
                k.value.map((v) => (
                  <span className="line" key={v}>
                    {v}
                  </span>
                ))
              ) : (
                '—'
              )
            ) : (
              k.value
            )}
            {k.hint && <span className="hint">{k.hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
