import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const RANGE_PRESETS = ["today", "7d", "30d", "month", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export type DateRange = { preset: RangePreset; from: string; to: string; days: number; label: string };

const MAX_DAYS = 366;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar date (YYYY-MM-DD) of an instant in the store's timezone. */
export function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/** Resolves ?range=&from=&to= into an inclusive store-local date range (never more than a year). */
export function parseRange(params: { range?: string; from?: string; to?: string }, timeZone: string, now = new Date()): DateRange {
  const today = localDate(now, timeZone);
  let preset: RangePreset = RANGE_PRESETS.includes(params.range as RangePreset) ? (params.range as RangePreset) : "30d";
  let from = today;
  let to = today;
  if (preset === "custom") {
    if (params.from && ISO.test(params.from) && params.to && ISO.test(params.to) && params.from <= params.to) {
      from = params.from;
      to = params.to;
      if (daysBetween(from, to) > MAX_DAYS) from = shift(to, -(MAX_DAYS - 1));
    } else preset = "30d";
  }
  if (preset === "7d") from = shift(today, -6);
  else if (preset === "30d") from = shift(today, -29);
  else if (preset === "month") from = `${today.slice(0, 7)}-01`;
  const days = daysBetween(from, to);
  const label = preset === "today" ? "Today" : preset === "7d" ? "Last 7 days" : preset === "30d" ? "Last 30 days" : preset === "month" ? "This month" : `${from} to ${to}`;
  return { preset, from, to, days, label };
}

/** `col` falls on a store-local calendar day within [from, to]. */
export function rangeWhere(col: AnyPgColumn | SQL, range: Pick<DateRange, "from" | "to">, timeZone: string): SQL {
  return sql`${col} >= (${range.from}::date::timestamp at time zone ${timeZone}) and ${col} < ((${range.to}::date + 1)::timestamp at time zone ${timeZone})`;
}

/** Store-local calendar day of a timestamptz column, as YYYY-MM-DD text. */
export function dayBucket(col: AnyPgColumn | SQL, timeZone: string) {
  return sql<string>`to_char((${col} at time zone ${timeZone})::date, 'YYYY-MM-DD')`.as("day");
}

/** Fills missing days with zeros so charts show gaps honestly. */
export function fillDays<T extends Record<string, number>>(range: Pick<DateRange, "from" | "to">, rows: ({ day: string } & Partial<T>)[], zero: T): ({ day: string } & T)[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: ({ day: string } & T)[] = [];
  for (let d = range.from; d <= range.to; d = shift(d, 1)) {
    const r = byDay.get(d);
    out.push({ ...zero, ...(r ?? {}), day: d } as { day: string } & T);
  }
  return out;
}

export function rangeQuery(range: DateRange): string {
  const sp = new URLSearchParams({ range: range.preset });
  if (range.preset === "custom") {
    sp.set("from", range.from);
    sp.set("to", range.to);
  }
  return sp.toString();
}
