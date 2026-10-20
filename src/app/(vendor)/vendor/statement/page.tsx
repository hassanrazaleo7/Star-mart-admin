import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireVendor } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { supplierBalance, supplierStatement } from "@/lib/suppliers/queries";

export const metadata: Metadata = { title: "Statement" };

export default async function VendorStatementPage() {
  const ctx = await requireVendor();
  const [balance, rows] = await Promise.all([supplierBalance(ctx.supplierId), supplierStatement(ctx.supplierId)]);
  const statusVariant = balance.status === "owed" ? "default" : balance.status === "overpaid" ? "destructive" : "outline";
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Statement</h1>
        <p className="text-sm text-muted-foreground">Deliveries received by the store, payments made to you and returns.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Card size="sm"><CardHeader><CardDescription>Delivered (received)</CardDescription><CardTitle className="tabular-nums">{formatPKR(balance.purchasedPaisa)}</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Paid to you</CardDescription><CardTitle className="tabular-nums">{formatPKR(balance.paidPaisa)}</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Returned</CardDescription><CardTitle className="tabular-nums">{formatPKR(balance.returnedPaisa)}</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Balance owed to you</CardDescription><CardTitle className="flex items-center gap-2 tabular-nums">{formatPKR(balance.balancePaisa)} <Badge variant={statusVariant}>{balance.status}</Badge></CardTitle></CardHeader></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Ledger</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Entry</TableHead><TableHead className="text-right">Delivered</TableHead><TableHead className="text-right">Paid / returned</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No entries yet.</TableCell></TableRow> : null}
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{formatDateTime(r.date)}</TableCell>
                  <TableCell><Badge variant="outline" className="mr-2 capitalize">{r.kind}</Badge>{r.ref}{r.note ? <span className="text-xs text-muted-foreground"> · {r.note}</span> : null}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.debitPaisa ? formatPKR(r.debitPaisa) : ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.creditPaisa ? formatPKR(r.creditPaisa) : ""}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatPKR(r.balancePaisa)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
