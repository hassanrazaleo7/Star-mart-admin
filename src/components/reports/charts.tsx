"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatPKR } from "@/lib/money";

export type Series = { key: string; label: string; color?: string; money?: boolean };
type Row = Record<string, number | string>;

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const dayLabel = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
};
const compactMoney = (paisa: number) => {
  const r = paisa / 100;
  return r >= 1_000_000 ? `${(r / 1_000_000).toFixed(1)}M` : r >= 1000 ? `${Math.round(r / 1000)}k` : String(Math.round(r));
};
const config = (series: Series[]): ChartConfig => Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: s.color ?? COLORS[i % COLORS.length] }]));

/** Daily series as stacked areas (money) or bars (counts). */
export function TimeSeriesChart({ data, series, kind = "area", height = 260 }: { data: Row[]; series: Series[]; kind?: "area" | "bar"; height?: number }) {
  const cfg = config(series);
  const money = series.some((s) => s.money !== false);
  const tooltip = <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => dayLabel(String(v))} formatter={(value, name) => <span className="flex w-full justify-between gap-3"><span className="text-muted-foreground">{cfg[String(name)]?.label ?? name}</span><span className="font-mono font-medium tabular-nums">{money ? formatPKR(Number(value)) : Number(value).toLocaleString()}</span></span>} />} />;
  if (kind === "bar") {
    return (
      <ChartContainer config={cfg} style={{ height }} className="w-full">
        <BarChart data={data} margin={{ left: 4, right: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={dayLabel} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (money ? compactMoney(Number(v)) : String(v))} />
          {tooltip}
          {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
          {series.map((s) => <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} radius={3} />)}
        </BarChart>
      </ChartContainer>
    );
  }
  return (
    <ChartContainer config={cfg} style={{ height }} className="w-full">
      <AreaChart data={data} margin={{ left: 4, right: 4 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${s.key})`} stopOpacity={0.5} />
              <stop offset="95%" stopColor={`var(--color-${s.key})`} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={dayLabel} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (money ? compactMoney(Number(v)) : String(v))} />
        {tooltip}
        {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
        {series.map((s) => <Area key={s.key} type="monotone" dataKey={s.key} stroke={`var(--color-${s.key})`} fill={`url(#fill-${s.key})`} strokeWidth={2} />)}
      </AreaChart>
    </ChartContainer>
  );
}

/** Horizontal bars for categorical breakdowns (channel, method, category). */
export function CategoryBarChart({ data, nameKey, valueKey, label, money = true, height }: { data: Row[]; nameKey: string; valueKey: string; label: string; money?: boolean; height?: number }) {
  const cfg: ChartConfig = { [valueKey]: { label, color: "var(--chart-1)" } };
  return (
    <ChartContainer config={cfg} style={{ height: height ?? Math.max(120, data.length * 36 + 24) }} className="w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => (money ? compactMoney(Number(v)) : String(v))} />
        <YAxis type="category" dataKey={nameKey} tickLine={false} axisLine={false} width={120} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value) => <span className="font-mono font-medium tabular-nums">{money ? formatPKR(Number(value)) : Number(value).toLocaleString()}</span>} />} />
        <Bar dataKey={valueKey} fill={`var(--color-${valueKey})`} radius={3} />
      </BarChart>
    </ChartContainer>
  );
}
