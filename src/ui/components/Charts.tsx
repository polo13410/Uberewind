import { useId, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { CountItem } from '../../core/types';
import { fmtAxis, fmtInt } from '../format';
import { useChartTheme } from '../useChartTheme';
import { ErrorBoundary } from './ErrorBoundary';

/* ---------------------------------------------------------------- Card */

export interface DataView {
  headers: string[];
  rows: Array<Array<string | number>>;
}

interface ChartCardProps {
  title: string;
  sub?: string;
  children: ReactNode;
  /** Accessible table view of the plotted values (also the fallback for low-contrast colours). */
  data?: DataView;
  actions?: ReactNode;
  wide?: boolean;
}

export function ChartCard({ title, sub, children, data, actions, wide }: ChartCardProps) {
  const id = useId();
  return (
    <section className={`card${wide ? ' wide' : ''}`} aria-labelledby={id}>
      <div className="card-head">
        <div>
          <h3 id={id}>{title}</h3>
          {sub && <p className="card-sub">{sub}</p>}
        </div>
        {actions}
      </div>
      <ErrorBoundary label={title}>
        {children}
        {data && data.rows.length > 0 && (
          <details className="data-details">
            <summary>Voir les données</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {data.headers.map((h, i) => (
                      <th key={h} className={i > 0 ? 'num' : undefined} scope="col">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j} className={j > 0 ? 'num' : undefined}>
                          {typeof c === 'number' ? fmtInt(c) : c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </ErrorBoundary>
    </section>
  );
}

export const Empty = ({ children = 'Aucune donnée.' }: { children?: ReactNode }) => <p className="empty">{children}</p>;

/* ---------------------------------------------------------------- Legend & tooltip */

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="legend">
      {items.map((it) => (
        <li key={it.name}>
          <span className="sw" style={{ background: it.color }} aria-hidden="true" />
          {it.name}
        </li>
      ))}
    </ul>
  );
}

type TT = TooltipContentProps;

function ChartTooltip({
  active,
  payload,
  label,
  title,
  value,
}: TT & { title?: (label: unknown) => string; value: (v: number, key: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tt">
      <div className="tt-title">{title ? title(label) : String(label ?? '')}</div>
      {payload.map((p) => (
        <div className="tt-row" key={String(p.dataKey)}>
          <i className="tt-key" style={{ background: p.color }} aria-hidden="true" />
          <b>{value(Number(p.value ?? 0), String(p.dataKey))}</b>
          {payload.length > 1 && <span>{p.name}</span>}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Column chart */

export interface Series {
  key: string;
  name: string;
}

interface ColumnChartProps {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: Series[];
  stacked?: boolean;
  height?: number;
  xFormat?: (v: string) => string;
  tooltipTitle?: (v: unknown) => string;
  valueFormat?: (v: number, key: string) => string;
  yFormat?: (v: number) => string;
}

export function ColumnChart({
  data,
  xKey,
  series,
  stacked,
  height = 240,
  xFormat,
  tooltipTitle,
  valueFormat = (v) => fmtInt(v),
  yFormat = fmtAxis,
}: ColumnChartProps) {
  const th = useChartTheme();
  if (!data.length) return <Empty />;
  const color = (i: number) => th.series[i % th.series.length];
  return (
    <>
      <Legend items={series.map((s, i) => ({ name: s.name, color: color(i) }))} />
      <div className="chart">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} barGap={2} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke={th.grid} />
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={{ stroke: th.axis }}
              tickFormatter={xFormat}
              minTickGap={4}
              interval="preserveStartEnd"
            />
            <YAxis tickLine={false} axisLine={false} tickFormatter={yFormat} width={52} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: th.cursor }}
              content={(p: TT) => <ChartTooltip {...p} title={tooltipTitle} value={valueFormat} />}
            />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                fill={color(i)}
                stackId={stacked ? 'a' : undefined}
                maxBarSize={24}
                radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
                stroke={stacked ? th.surface : undefined}
                strokeWidth={stacked ? 1 : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Horizontal bars (ranked categories) */

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

interface HBarChartProps {
  items: CountItem[];
  label?: (key: string) => string;
  valueFormat?: (v: number) => string;
  /** Categorical slot, so a chart keeps the colour of the entity it shows. */
  colorIndex?: number;
}

export function HBarChart({ items, label = (k) => k, valueFormat = fmtInt, colorIndex = 0 }: HBarChartProps) {
  const th = useChartTheme();
  if (!items.length) return <Empty />;
  const data = items.map((it) => ({ name: label(it.key), value: it.count }));
  const longest = Math.max(...data.map((d) => Math.min(d.name.length, 22)));
  const yWidth = Math.min(150, Math.max(48, longest * 7 + 8));
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={data.length * 30 + 16}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 0 }} barCategoryGap={6}>
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="name"
            width={yWidth}
            tickLine={false}
            axisLine={{ stroke: th.axis }}
            tickFormatter={(v: string) => truncate(v, 22)}
            interval={0}
          />
          <Tooltip
            cursor={{ fill: th.cursor }}
            content={(p: TT) => <ChartTooltip {...p} value={(v) => valueFormat(v)} />}
          />
          <Bar
            dataKey="value"
            name="Valeur"
            fill={th.series[colorIndex % th.series.length]}
            maxBarSize={20}
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
          >
            <LabelList dataKey="value" position="right" formatter={(v: unknown) => valueFormat(Number(v))} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------------------------------------------------------- Scatter */

interface ScatterPlotProps {
  points: { km: number; fare: number }[];
  currency: string;
  colorIndex?: number;
  fmtFare: (v: number) => string;
}

export function ScatterPlot({ points, currency, colorIndex = 0, fmtFare }: ScatterPlotProps) {
  const th = useChartTheme();
  if (!points.length) return <Empty>Aucune course avec prix et distance.</Empty>;
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ top: 8, right: 8, bottom: 16, left: -4 }}>
          <CartesianGrid stroke={th.grid} />
          <XAxis
            type="number"
            dataKey="km"
            name="Distance"
            unit=" km"
            tickLine={false}
            axisLine={{ stroke: th.axis }}
            tickFormatter={fmtAxis}
          />
          <YAxis
            type="number"
            dataKey="fare"
            name="Tarif"
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtAxis}
            width={56}
            label={{ value: currency, angle: -90, position: 'insideLeft', offset: 14 }}
          />
          <Tooltip
            cursor={{ stroke: th.axis }}
            content={({ active, payload }: TT) => {
              const p = active && payload?.[0]?.payload as { km: number; fare: number } | undefined;
              if (!p) return null;
              return (
                <div className="tt">
                  <div className="tt-row">
                    <b>{fmtFare(p.fare)}</b>
                  </div>
                  <div className="tt-title">{fmtAxis(p.km)} km</div>
                </div>
              );
            }}
          />
          <Scatter
            data={points}
            fill={th.series[colorIndex % th.series.length]}
            stroke={th.surface}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
