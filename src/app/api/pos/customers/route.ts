import { getCurrentSession } from "@/lib/auth/session";
import { searchCustomers } from "@/lib/customers/queries";
import { isStaff } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session || !isStaff(session.user.role)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  const customers = q.length >= 2 ? await searchCustomers(q, 10) : [];
  return Response.json({ customers }, { headers: { "Cache-Control": "private, no-store" } });
}
