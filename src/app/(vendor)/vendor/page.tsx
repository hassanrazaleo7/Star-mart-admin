import type { Metadata } from "next";
import { PackagePlusIcon, TruckIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireVendor } from "@/lib/auth/session";
import { formatQty } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { supplierBalance, vendorDashboard } from "@/lib/suppliers/queries";

export const metadata: Metadata = { title: "Supplier portal" };

export default async function VendorHomePage() {
  const ctx = await requireVendor();
  const [stats, balance] = await Promise.all([vendorDashboard(ctx.supplierId), supplierBalance(ctx.supplierId)]);
  const statusVariant = balance.status === "owed" ? "default" : balance.status === "overpaid" ? "destructive" : "outline";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Welcome, {ctx.user.name}</h1>
          <p className="text-sm text-muted-foreground">Supplier portal for {ctx.supplierName}.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/vendor/submit/product" />}><PackagePlusIcon /> Propose a product</Button>
          <Button nativeButton={false} render={<Link href="/vendor/submit/supply" />}><TruckIcon /> Report a delivery</Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Card size="sm"><CardHeader><CardDescription>Your products</CardDescription><CardTitle>{stats.productCount}</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Low stock</CardDescription><CardTitle className="text-destructive">{stats.lowStockCount}</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Pending submissions</CardDescription><CardTitle>{stats.pendingSubmissions}</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Balance (store owes you)</CardDescription><CardTitle className="flex items-center gap-2 tabular-nums">{formatPKR(balance.balancePaisa)} <Badge variant={statusVariant}>{balance.status}</Badge></CardTitle></CardHeader></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Low stock at the store</CardTitle><CardDescription>Products of yours that are at or below their reorder level. Consider reporting a delivery.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">In stock</TableHead><TableHead className="text-right">Reorder level</TableHead><TableHead className="text-right">Suggested qty</TableHead></TableRow></TableHeader>
            <TableBody>
              {stats.lowStock.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nothing is low right now.</TableCell></TableRow> : null}
              {stats.lowStock.map((p) => (
                <TableRow key={p.id}><TableCell>{p.name}<div className="font-mono text-xs text-muted-foreground">{p.sku}</div></TableCell><TableCell className="text-right"><Badge variant="destructive">{formatQty(p.stockQty, p.unit)}</Badge></TableCell><TableCell className="text-right">{formatQty(p.reorderLevel, p.unit)}</TableCell><TableCell className="text-right">{p.reorderQty > 0 ? formatQty(p.reorderQty, p.unit) : "—"}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
