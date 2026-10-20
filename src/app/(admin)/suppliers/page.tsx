import type { Metadata } from "next";
import { PlusIcon } from "lucide-react";
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
import { formatPKR } from "@/lib/money";
import { ROLE_GROUPS } from "@/lib/rbac";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { listSuppliers, PAGE_SIZE } from "@/lib/suppliers/queries";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  await requireRole(ROLE_GROUPS.managers);
  const q = firstParam(raw.q) ?? "";
  const active = (firstParam(raw.active) as "all" | "active" | "inactive" | undefined) ?? "active";
  const page = Math.max(1, Number(firstParam(raw.page) ?? 1) || 1);
  const result = await listSuppliers({ q, active, page });

  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status)} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Suppliers</h1>
          <p className="text-sm text-muted-foreground">{result.total} supplier{result.total === 1 ? "" : "s"}</p>
        </div>
        <Button nativeButton={false} render={<Link href="/suppliers/new" />}>
          <PlusIcon /> New supplier
        </Button>
      </div>
      <form method="get" className="flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Search name, contact, phone, email" className="max-w-sm" aria-label="Search" data-scanner-ignore />
        <NativeSelect name="active" defaultValue={active} aria-label="Status">
          <NativeSelectOption value="active">Active</NativeSelectOption>
          <NativeSelectOption value="inactive">Inactive</NativeSelectOption>
          <NativeSelectOption value="all">All</NativeSelectOption>
        </NativeSelect>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        <CardContent className="grid gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">No suppliers found.</TableCell>
                </TableRow>
              ) : null}
              {result.rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/suppliers/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-sm">
                      <span>{s.contactName ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">{[s.phone, s.email].filter(Boolean).join(" · ")}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{s.productCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={s.balancePaisa > 0 ? "text-destructive" : s.balancePaisa < 0 ? "text-primary" : ""}>{formatPKR(s.balancePaisa)}</span>
                  </TableCell>
                  <TableCell>{s.isActive ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationLinks page={result.page} pageCount={result.pageCount} total={result.total} pageSize={PAGE_SIZE} basePath="/suppliers" params={{ q, active }} />
        </CardContent>
      </Card>
    </div>
  );
}
