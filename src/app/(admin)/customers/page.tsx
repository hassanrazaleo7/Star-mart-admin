import type { Metadata } from "next";
import Link from "next/link";
import { PaginationLinks } from "@/components/pagination-links";
import { StatusToast } from "@/components/status-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { CUSTOMERS_PAGE_SIZE, listCustomers } from "@/lib/customers/queries";
import { formatDateTime } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { isManager, ROLE_GROUPS } from "@/lib/rbac";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { CustomerFormDialog } from "./customer-form-dialog";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  const { user } = await requireRole(ROLE_GROUPS.staff);
  const params = { q: firstParam(raw.q) ?? "", type: firstParam(raw.type) ?? "", active: firstParam(raw.active) ?? "active", page: Math.max(1, Number(firstParam(raw.page) ?? 1) || 1) };
  const result = await listCustomers(params);

  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status)} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">{result.total} customer{result.total === 1 ? "" : "s"} · loyalty points and credit accounts.</p>
        </div>
        <CustomerFormDialog canSetCredit={isManager(user.role)} />
      </div>
      <form method="get" className="flex flex-wrap gap-2">
        <Input name="q" defaultValue={params.q} placeholder="Search name, phone or email" className="max-w-sm" data-scanner-ignore />
        <NativeSelect name="type" defaultValue={params.type}><NativeSelectOption value="">All types</NativeSelectOption><NativeSelectOption value="retail">Retail</NativeSelectOption><NativeSelectOption value="wholesale">Wholesale</NativeSelectOption></NativeSelect>
        <NativeSelect name="active" defaultValue={params.active}><NativeSelectOption value="active">Active</NativeSelectOption><NativeSelectOption value="inactive">Inactive</NativeSelectOption><NativeSelectOption value="all">All</NativeSelectOption></NativeSelect>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        <CardContent className="grid gap-4">
          <Table>
            <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Points</TableHead><TableHead className="text-right">Credit used / limit</TableHead><TableHead className="text-right">Orders</TableHead><TableHead>Last order</TableHead></TableRow></TableHeader>
            <TableBody>
              {result.rows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No customers found.</TableCell></TableRow> : null}
              {result.rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell><Link href={`/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link><div className="text-xs text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(" · ")}</div>{!c.isActive ? <Badge variant="secondary" className="mt-1">Inactive</Badge> : null}</TableCell>
                  <TableCell><Badge variant="outline">{c.type}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{c.pointsBalance}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.creditLimitPaisa > 0 ? `${formatPKR(c.creditBalancePaisa, { symbol: false })} / ${formatPKR(c.creditLimitPaisa, { symbol: false })}` : "—"}</TableCell>
                  <TableCell className="text-right">{c.orderCount}</TableCell>
                  <TableCell>{formatDateTime(c.lastOrderAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationLinks page={result.page} pageCount={result.pageCount} total={result.total} pageSize={CUSTOMERS_PAGE_SIZE} basePath="/customers" params={{ q: params.q, type: params.type, active: params.active }} />
        </CardContent>
      </Card>
    </div>
  );
}
