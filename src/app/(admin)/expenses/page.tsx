import type { Metadata } from "next";
import { DownloadIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { PaginationLinks } from "@/components/pagination-links";
import { StatusToast } from "@/components/status-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { EXPENSES_PAGE_SIZE, listExpenseCategories, listExpenses } from "@/lib/expenses/queries";
import { formatDate } from "@/lib/format";
import { formatPKR } from "@/lib/money";
import { ROLE_GROUPS } from "@/lib/rbac";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { expenseListParamsSchema } from "@/lib/validation/expenses";
import { deleteExpenseAction } from "./actions";
import { ExpenseCategoriesCard } from "./categories-card";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  await requireRole(ROLE_GROUPS.managers);
  const parsed = expenseListParamsSchema.safeParse(Object.fromEntries(["q", "category", "method", "from", "to", "page"].map((k) => [k, firstParam(raw[k]) || undefined])));
  const params = parsed.success ? parsed.data : expenseListParamsSchema.parse({});
  const [result, categories] = await Promise.all([listExpenses(params), listExpenseCategories()]);
  const qs = new URLSearchParams(Object.entries({ q: params.q, category: params.category, method: params.method, from: params.from, to: params.to }).filter((e): e is [string, string] => Boolean(e[1])));

  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.msg)} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Expenses</h1>
          <p className="text-sm text-muted-foreground">{result.total} expense{result.total === 1 ? "" : "s"} · {formatPKR(result.sumPaisa)} in the current filter.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href={`/api/reports/expenses?${qs.toString()}`} prefetch={false} />}><DownloadIcon /> Export CSV</Button>
          <Button nativeButton={false} render={<Link href="/expenses/new" />}><PlusIcon /> Add expense</Button>
        </div>
      </div>
      <form method="get" className="flex flex-wrap gap-2">
        <Input name="q" defaultValue={params.q ?? ""} placeholder="Description or reference" className="max-w-xs" data-scanner-ignore />
        <NativeSelect name="category" defaultValue={params.category ?? ""}><NativeSelectOption value="">All categories</NativeSelectOption>{categories.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}</NativeSelect>
        <NativeSelect name="method" defaultValue={params.method ?? ""}><NativeSelectOption value="">Any method</NativeSelectOption><NativeSelectOption value="cash">Cash</NativeSelectOption><NativeSelectOption value="card">Card</NativeSelectOption><NativeSelectOption value="bank_transfer">Bank transfer</NativeSelectOption></NativeSelect>
        <Input type="date" name="from" defaultValue={params.from ?? ""} className="w-40" aria-label="From date" />
        <Input type="date" name="to" defaultValue={params.to ?? ""} className="w-40" aria-label="To date" />
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader><CardTitle>Expense log</CardTitle><CardDescription>Newest first. Deleting hides an expense from reports; it stays in the audit log.</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right" /></TableRow></TableHeader>
              <TableBody>
                {result.rows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No expenses recorded.</TableCell></TableRow> : null}
                {result.rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(e.incurredAt)}</TableCell>
                    <TableCell><Badge variant="outline">{e.categoryName}</Badge></TableCell>
                    <TableCell><Link href={`/expenses/${e.id}/edit`} className="font-medium hover:underline">{e.description}</Link>{e.reference ? <div className="text-xs text-muted-foreground">{e.reference}</div> : null}{e.receiptUrl ? <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Receipt</a> : null}</TableCell>
                    <TableCell className="capitalize">{e.method.replace("_", " ")}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPKR(e.amountPaisa)}</TableCell>
                    <TableCell className="text-right">
                      <form action={deleteExpenseAction}>
                        <input type="hidden" name="expenseId" value={e.id} />
                        <Button type="submit" variant="ghost" size="sm">Delete</Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationLinks page={result.page} pageCount={result.pageCount} total={result.total} pageSize={EXPENSES_PAGE_SIZE} basePath="/expenses" params={{ q: params.q, category: params.category, method: params.method, from: params.from, to: params.to }} />
          </CardContent>
        </Card>
        <ExpenseCategoriesCard categories={categories} />
      </div>
    </div>
  );
}
