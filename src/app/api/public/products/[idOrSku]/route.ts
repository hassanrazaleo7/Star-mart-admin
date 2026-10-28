import { checkStorefrontAccess, json, preflight } from "@/lib/storefront/http";
import { getStorefrontProduct } from "@/lib/storefront/catalog";

export const dynamic = "force-dynamic";

/** One active product (by id or SKU) with its sellable batches. */
export async function GET(request: Request, ctx: { params: Promise<{ idOrSku: string }> }) {
  const denied = checkStorefrontAccess(request);
  if (denied) return denied;
  const { idOrSku } = await ctx.params;
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(idOrSku)) return json(request, { error: "not_found" }, { status: 404 });
  const result = await getStorefrontProduct(decodeURIComponent(idOrSku));
  if (!result) return json(request, { error: "not_found", message: "No active product with that id or SKU." }, { status: 404 });
  return json(request, result);
}

export const OPTIONS = preflight;
