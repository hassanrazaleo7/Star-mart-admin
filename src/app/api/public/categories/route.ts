import { checkStorefrontAccess, json, preflight } from "@/lib/storefront/http";
import { listStorefrontCategories } from "@/lib/storefront/catalog";

export const dynamic = "force-dynamic";

/** Active categories with their count of active products. */
export async function GET(request: Request) {
  const denied = checkStorefrontAccess(request);
  if (denied) return denied;
  return json(request, await listStorefrontCategories());
}

export const OPTIONS = preflight;
