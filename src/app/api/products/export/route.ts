import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, suppliers } from "@/db/schema";
import { audit } from "@/lib/auth/audit";
import { getCurrentSession, getRequestMeta } from "@/lib/auth/session";
import { csvTemplate, exportRowsToCsv } from "@/lib/products/csv";
import { isManager } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Streams the catalogue as CSV (same columns the importer accepts). `?template=1` returns a sample file. */
export async function GET(request: Request) {
  const ctx = await getCurrentSession();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  if (!isManager(ctx.user.role)) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const stamp = new Date().toISOString().slice(0, 10);
  if (url.searchParams.get("template") === "1") {
    return new Response("﻿" + csvTemplate(), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="products-template.csv"' },
    });
  }

  const status = url.searchParams.get("status");
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode("﻿"));
      const CHUNK = 1000;
      let offset = 0;
      let first = true;
      for (;;) {
        const rows = await db
          .select({
            sku: products.sku,
            name: products.name,
            barcode: products.barcode,
            category: categories.name,
            brand: products.brand,
            unit: products.unit,
            allowFractional: products.allowFractional,
            costPaisa: products.costPaisa,
            pricePaisa: products.pricePaisa,
            taxRateBps: products.taxRateBps,
            reorderLevel: products.reorderLevel,
            reorderQty: products.reorderQty,
            supplier: suppliers.name,
            status: products.status,
            stockQty: products.stockQty,
            description: products.description,
          })
          .from(products)
          .leftJoin(categories, eq(categories.id, products.categoryId))
          .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
          .where(status && status !== "all" ? eq(products.status, status as "active" | "draft" | "archived") : undefined)
          .orderBy(asc(products.sku))
          .limit(CHUNK)
          .offset(offset);
        if (rows.length === 0 && !first) break;
        controller.enqueue(encoder.encode(exportRowsToCsv(rows, first) + "\n"));
        first = false;
        if (rows.length < CHUNK) break;
        offset += CHUNK;
      }
      controller.close();
    },
  });

  const meta = await getRequestMeta();
  await audit("products.exported", { ...meta, actorUserId: ctx.user.id, metadata: { status: status ?? "all" } });

  return new Response(stream, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="products-${stamp}.csv"` },
  });
}
