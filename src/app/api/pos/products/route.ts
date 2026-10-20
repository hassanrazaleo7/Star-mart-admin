import { getCurrentSession } from "@/lib/auth/session";
import { findProductByBarcode, searchProducts } from "@/lib/products/queries";
import { isStaff } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Lightweight product lookup for the till: ?q=<text> (name/SKU/barcode) or ?barcode=<exact>. */
export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session || !isStaff(session.user.role)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const barcode = url.searchParams.get("barcode")?.trim();
  if (barcode) {
    const product = await findProductByBarcode(barcode.slice(0, 64));
    return Response.json({ product }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const products = q.length >= 1 ? await searchProducts(q, { limit: 20 }) : [];
  return Response.json({ products }, { headers: { "Cache-Control": "private, no-store" } });
}
