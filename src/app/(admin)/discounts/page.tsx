import type { Metadata } from "next";
import { StatusToast } from "@/components/status-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { listDiscountCodes } from "@/lib/customers/queries";
import { formatDateTime } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { ROLE_GROUPS } from "@/lib/rbac";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { setDiscountActiveAction } from "./actions";
import { DiscountFormDialog } from "./discount-form-dialog";

export const metadata: Metadata = { title: "Discount codes" };

export default async function DiscountsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  await requireRole(ROLE_GROUPS.managers);
  const { codes, now } = await listDiscountCodes();
  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status)} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Discount codes</h1>
          <p className="text-sm text-muted-foreground">Codes cashiers can apply at the POS or on orders.</p>
        </div>
        <DiscountFormDialog />
      </div>
      <Card>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Discount</TableHead><TableHead>Conditions</TableHead><TableHead>Validity</TableHead><TableHead className="text-right">Used</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {codes.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No discount codes yet.</TableCell></TableRow> : null}
              {codes.map((d) => {
                const expired = d.endsAt ? d.endsAt.getTime() <= now : false;
                const exhausted = d.usageLimit != null && d.usedCount >= d.usageLimit;
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono font-medium">{d.code}</TableCell>
                    <TableCell>{d.kind === "percent" ? `${d.value / 100}% off` : `${formatPKR(d.value)} off`}{d.maxDiscountPaisa != null ? <div className="text-xs text-muted-foreground">max {formatPKR(d.maxDiscountPaisa)}</div> : null}</TableCell>
                    <TableCell>{d.minOrderPaisa > 0 ? `Min order ${formatPKR(d.minOrderPaisa)}` : "—"}</TableCell>
                    <TableCell className="text-xs">{d.startsAt ? `from ${formatDateTime(d.startsAt)}` : ""}{d.endsAt ? <div>until {formatDateTime(d.endsAt)}</div> : null}{!d.startsAt && !d.endsAt ? "Always" : null}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.usedCount}{d.usageLimit != null ? ` / ${d.usageLimit}` : ""}</TableCell>
                    <TableCell>{!d.isActive ? <Badge variant="secondary">Inactive</Badge> : expired ? <Badge variant="destructive">Expired</Badge> : exhausted ? <Badge variant="destructive">Used up</Badge> : <Badge variant="outline">Active</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <DiscountFormDialog discount={d} trigger={<Button variant="ghost" size="sm" />} />
                        <form action={setDiscountActiveAction}>
                          <input type="hidden" name="discountId" value={d.id} />
                          <input type="hidden" name="active" value={d.isActive ? "false" : "true"} />
                          <Button type="submit" variant="ghost" size="sm">{d.isActive ? "Disable" : "Enable"}</Button>
                        </form>
                      </div>
                    </TableCell>
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
