import { z } from "zod";
import { checkStorefrontAccess, json, preflight } from "@/lib/storefront/http";
import { listStorefrontProducts, STOREFRONT_SORTS } from "@/lib/storefront/catalog";

export const dynamic = "force-dynamic";

const flag = z.preprocess((v) => v === "1" || v === "true", z.boolean());
const paramsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.uuid().optional(),
  inStock: flag,
  expiringSoon: flag,
  sort: z.enum(STOREFRONT_SORTS).default("name"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

/** Public catalogue: active products with sellable stock and expiry info. */
export async function GET(request: Request) {
  const denied = checkStorefrontAccess(request);
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const parsed = paramsSchema.safeParse(Object.fromEntries([...sp.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return json(request, { error: "invalid_query", message: parsed.error.issues[0]?.message ?? "Invalid query" }, { status: 400 });
  return json(request, await listStorefrontProducts(parsed.data));
}

export const OPTIONS = preflight;
