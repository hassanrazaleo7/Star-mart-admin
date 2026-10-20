import { DownloadIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { rangeQuery, type DateRange } from "@/lib/reports/range";

/** GET form: preset select plus custom from/to; optional CSV export link for the same range. */
export function DateRangeControl({ range, basePath, exportPath }: { range: DateRange; basePath: string; exportPath?: string }) {
  return (
    <form method="get" action={basePath} className="flex flex-wrap items-center gap-2">
      <NativeSelect name="range" defaultValue={range.preset} aria-label="Date range">
        <NativeSelectOption value="today">Today</NativeSelectOption>
        <NativeSelectOption value="7d">Last 7 days</NativeSelectOption>
        <NativeSelectOption value="30d">Last 30 days</NativeSelectOption>
        <NativeSelectOption value="month">This month</NativeSelectOption>
        <NativeSelectOption value="custom">Custom</NativeSelectOption>
      </NativeSelect>
      <Input type="date" name="from" defaultValue={range.from} className="w-40" aria-label="From date" />
      <Input type="date" name="to" defaultValue={range.to} className="w-40" aria-label="To date" />
      <Button type="submit" variant="secondary">Apply</Button>
      <span className="text-sm text-muted-foreground">{range.label} · {range.days} day{range.days === 1 ? "" : "s"}</span>
      {exportPath ? <Button variant="outline" size="sm" className="ml-auto" nativeButton={false} render={<Link href={`${exportPath}?${rangeQuery(range)}`} prefetch={false} />}><DownloadIcon /> Export CSV</Button> : null}
    </form>
  );
}
