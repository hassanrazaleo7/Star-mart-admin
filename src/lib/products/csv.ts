import Papa from "papaparse";
import { paisaToDecimalString } from "@/lib/money";
import { importRowSchema, type ImportRow } from "@/lib/validation/products";

export const IMPORT_HEADERS = [
  "sku",
  "name",
  "barcode",
  "category",
  "brand",
  "unit",
  "allow_fractional",
  "cost",
  "price",
  "tax_rate_percent",
  "reorder_level",
  "reorder_qty",
  "supplier",
  "status",
  "stock_qty",
  "description",
  "tracks_expiry",
  "shelf_life_days",
  "initial_expiry",
] as const;

export type ParsedImportRow = { line: number; data?: ImportRow; error?: string; raw: Record<string, string> };

export const MAX_IMPORT_ROWS = 5000;

/** Parses CSV text into validated rows; per-row errors are kept, not thrown. */
export function parseProductsCsv(text: string): { rows: ParsedImportRow[]; headerError?: string } {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });
  const headers = result.meta.fields ?? [];
  if (!headers.includes("sku") || !headers.includes("name")) {
    return { rows: [], headerError: "The CSV must have at least the columns: sku, name" };
  }
  const rows: ParsedImportRow[] = result.data.slice(0, MAX_IMPORT_ROWS).map((raw, index) => {
    const parsed = importRowSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { line: index + 2, raw, error: `${issue?.path.join(".") || "row"}: ${issue?.message ?? "invalid"}` };
    }
    return { line: index + 2, raw, data: parsed.data };
  });
  // Duplicate SKUs within the file are errors (last one would silently win otherwise).
  const seen = new Map<string, number>();
  for (const row of rows) {
    if (!row.data) continue;
    const prev = seen.get(row.data.sku);
    if (prev) {
      row.error = `sku: duplicate of line ${prev}`;
      row.data = undefined;
    } else {
      seen.set(row.data.sku, row.line);
    }
  }
  return { rows };
}

export type ExportRow = {
  sku: string;
  name: string;
  barcode: string | null;
  category: string | null;
  brand: string | null;
  unit: string;
  allowFractional: boolean;
  costPaisa: number;
  pricePaisa: number;
  taxRateBps: number;
  reorderLevel: number;
  reorderQty: number;
  supplier: string | null;
  status: string;
  stockQty: number;
  description: string | null;
  tracksExpiry: boolean;
  shelfLifeDays: number | null;
};

export function exportRowsToCsv(rows: ExportRow[], includeHeader: boolean): string {
  const data = rows.map((r) => ({
    sku: r.sku,
    name: r.name,
    barcode: r.barcode ?? "",
    category: r.category ?? "",
    brand: r.brand ?? "",
    unit: r.unit,
    allow_fractional: r.allowFractional ? "true" : "false",
    cost: paisaToDecimalString(r.costPaisa),
    price: paisaToDecimalString(r.pricePaisa),
    tax_rate_percent: (r.taxRateBps / 100).toFixed(2),
    reorder_level: r.reorderLevel,
    reorder_qty: r.reorderQty,
    supplier: r.supplier ?? "",
    status: r.status,
    stock_qty: r.stockQty,
    description: r.description ?? "",
    tracks_expiry: r.tracksExpiry ? "true" : "false",
    shelf_life_days: r.shelfLifeDays ?? "",
    initial_expiry: "",
  }));
  return Papa.unparse(data, { header: includeHeader, columns: [...IMPORT_HEADERS] });
}

export function csvTemplate(): string {
  return Papa.unparse(
    [
      {
        sku: "RICE-5KG",
        name: "Basmati rice 5 kg",
        barcode: "2000000000017",
        category: "Grocery",
        brand: "Guard",
        unit: "pcs",
        allow_fractional: "false",
        cost: "1450.00",
        price: "1650.00",
        tax_rate_percent: "0",
        reorder_level: "5",
        reorder_qty: "20",
        supplier: "",
        status: "active",
        stock_qty: "0",
        description: "",
        tracks_expiry: "true",
        shelf_life_days: "365",
        initial_expiry: "",
      },
    ],
    { columns: [...IMPORT_HEADERS] },
  );
}
