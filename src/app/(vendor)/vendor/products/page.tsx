import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireVendor } from "@/lib/auth/session";
import { formatQty } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { listSupplierProducts } from "@/lib/suppliers/queries";

export const metadata: Metadata = { title: "My products" };

export default async function VendorProductsPage() {
  const ctx = await requireVendor();
  const products = await listSupplierProducts(ctx.supplierId);
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">My products</h1>
        <p className="text-sm text-muted-foreground">Catalogue items supplied by {ctx.supplierName} and their current stock at the store.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>{products.length} product{products.length === 1 ? "" : "s"}</CardTitle><CardDescription>Cost is the last price the store paid you.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Barcode</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">In stock</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {products.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No products yet. Propose one from the overview page.</TableCell></TableRow> : null}
              {products.map((p) => {
                const low = p.reorderLevel > 0 && p.stockQty <= p.reorderLevel;
                return (
                  <TableRow key={p.id}>
                    <TableCell>{p.name}<div className="font-mono text-xs text-muted-foreground">{p.sku}</div></TableCell>
                    <TableCell className="font-mono text-xs">{p.barcode ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPKR(p.costPaisa)}</TableCell>
                    <TableCell className="text-right"><Badge variant={low ? "destructive" : "secondary"}>{formatQty(p.stockQty, p.unit)}</Badge></TableCell>
                    <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
