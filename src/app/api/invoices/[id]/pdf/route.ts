import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { renderInvoicePdf } from "@/lib/pdf/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Downloads (or inlines with ?inline=1) the PDF invoice for an order. Staff only. */
export async function GET(request: Request, ctx: RouteContext<"/api/invoices/[id]/pdf">) {
  const session = await getCurrentSession();
  if (!session || session.user.role === "vendor") return new Response("Not found", { status: 404 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const result = await renderInvoicePdf(id);
  if (!result) return new Response("Not found", { status: 404 });
  await db.update(invoices).set({ pdfGeneratedAt: sql`now()` }).where(eq(invoices.orderId, id));
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${result.filename}"`,
      "Cache-Control": "private, no-store",
      "Content-Length": String(result.buffer.byteLength),
    },
  });
}
