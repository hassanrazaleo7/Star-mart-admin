import bwipjs from "bwip-js/node";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { symbologyFor } from "@/lib/products/barcode";

export const dynamic = "force-dynamic";

/**
 * Renders a product's barcode as SVG (default) or PNG. The proxy skips paths with
 * image extensions, so this route uses a query parameter and checks the session itself.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/barcode/[productId]">) {
  const session = await getCurrentSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { productId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return new Response("Not found", { status: 404 });

  const [product] = await db
    .select({ barcode: products.barcode, sku: products.sku, supplierId: products.supplierId, name: products.name })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) return new Response("Not found", { status: 404 });
  if (session.user.role === "vendor" && product.supplierId !== session.user.supplierId) {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "png" ? "png" : "svg";
  const text = product.barcode ?? product.sku;
  const download = url.searchParams.get("download") === "1";
  const safeName = `${product.sku}-${text}`.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
  const clamp = (v: string | null, fallback: number, min: number, max: number) => Math.min(max, Math.max(min, Number(v ?? fallback) || fallback));
  const options = {
    bcid: symbologyFor(text),
    text,
    scale: clamp(url.searchParams.get("scale"), 2, 1, 8),
    height: clamp(url.searchParams.get("height"), 12, 5, 40),
    includetext: url.searchParams.get("text") !== "0",
    textxalign: "center" as const,
    paddingwidth: 4,
    paddingheight: 2,
  };

  try {
    if (format === "png") {
      const png = await bwipjs.toBuffer(options);
      return new Response(new Uint8Array(png), {
        headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600", ...(download ? { "Content-Disposition": `attachment; filename="${safeName}.png"` } : {}) },
      });
    }
    const svg = bwipjs.toSVG(options);
    return new Response(svg, {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600", ...(download ? { "Content-Disposition": `attachment; filename="${safeName}.svg"` } : {}) },
    });
  } catch (error) {
    return new Response(`Cannot render barcode: ${(error as Error).message}`, { status: 422 });
  }
}
