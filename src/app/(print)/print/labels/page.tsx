import type { Metadata } from "next";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { PrintButton } from "@/components/print-button";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireRole } from "@/lib/auth/session";
import { formatPKR } from "@/lib/money";
import { ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Print labels" };

const paramsSchema = z.object({
  ids: z.string().transform((s) => s.split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200)),
  copies: z.coerce.number().int().min(1).max(50).default(1),
  layout: z.enum(["a4-65", "a4-24", "thermal-50x30"]).default("a4-65"),
});

const LAYOUTS = {
  "a4-65": { page: "A4", margin: "8mm 5mm", columns: 5, cellWidth: "38.1mm", cellHeight: "21.2mm", fontSize: "7pt", barcodeHeight: "9mm" },
  "a4-24": { page: "A4", margin: "10mm 7mm", columns: 3, cellWidth: "63.5mm", cellHeight: "33.9mm", fontSize: "9pt", barcodeHeight: "14mm" },
  "thermal-50x30": { page: "50mm 30mm", margin: "1.5mm", columns: 1, cellWidth: "47mm", cellHeight: "27mm", fontSize: "8pt", barcodeHeight: "12mm" },
} as const;

export default async function LabelsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole(ROLE_GROUPS.managers);
  const raw = await searchParams;
  const parsed = paramsSchema.safeParse({ ids: firstParam(raw.ids) ?? "", copies: firstParam(raw.copies), layout: firstParam(raw.layout) });
  const { ids, copies, layout } = parsed.success ? parsed.data : { ids: [], copies: 1, layout: "a4-65" as const };
  const settings = await getSettings();
  const rows = ids.length
    ? await db
        .select({ id: products.id, name: products.name, sku: products.sku, barcode: products.barcode, pricePaisa: products.pricePaisa })
        .from(products)
        .where(inArray(products.id, ids))
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
  const cells = ordered.flatMap((p) => Array.from({ length: copies }, () => p));
  const L = LAYOUTS[layout];

  return (
    <div className="p-4 print:p-0">
      <style>{`
        @page { size: ${L.page}; margin: ${L.margin}; }
        @media print { .no-print { display: none !important; } body { background: white; } }
        .labels { display: grid; grid-template-columns: repeat(${L.columns}, ${L.cellWidth}); gap: 0; justify-content: center; }
        .label { width: ${L.cellWidth}; height: ${L.cellHeight}; box-sizing: border-box; padding: 1.5mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; font-size: ${L.fontSize}; overflow: hidden; break-inside: avoid; }
        .label img { height: ${L.barcodeHeight}; width: auto; max-width: 100%; }
        .label .name { font-weight: 600; line-height: 1.1; max-height: 2.2em; overflow: hidden; }
        .label .price { font-weight: 700; }
      `}</style>
      <div className="no-print mb-4 flex items-center gap-3">
        <PrintButton label={`Print ${cells.length} label${cells.length === 1 ? "" : "s"}`} />
        <form className="flex items-center gap-2 text-sm" method="get">
          <input type="hidden" name="ids" value={ids.join(",")} />
          <label>
            Layout{" "}
            <select name="layout" defaultValue={layout} className="rounded border px-2 py-1">
              <option value="a4-65">A4 · 65 per sheet (38×21 mm)</option>
              <option value="a4-24">A4 · 24 per sheet (64×34 mm)</option>
              <option value="thermal-50x30">Thermal 50×30 mm</option>
            </select>
          </label>
          <label>
            Copies <input name="copies" type="number" min={1} max={50} defaultValue={copies} className="w-16 rounded border px-2 py-1" />
          </label>
          <button type="submit" className="rounded border px-3 py-1">Apply</button>
        </form>
        {cells.length === 0 ? <span className="text-sm text-muted-foreground">No products selected.</span> : null}
      </div>
      <div className="labels">
        {cells.map((p, i) => (
          <div className="label" key={`${p.id}-${i}`}>
            <div className="name">{p.name}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/barcode/${p.id}?format=svg&height=10`} alt={p.barcode ?? p.sku} />
            <div className="price">{formatPKR(p.pricePaisa, { symbol: settings.currency.symbol })}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
