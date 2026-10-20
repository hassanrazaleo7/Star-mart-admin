"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { importProductsAction, type ImportState } from "../actions";

export function ImportForm() {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importProductsAction, { error: null, step: "upload" });

  if (state.step === "done" && state.result) {
    return (
      <div className="grid gap-4">
        <Alert>
          <AlertTitle>Import complete</AlertTitle>
          <AlertDescription>
            {state.result.created} created, {state.result.updated} updated, {state.result.skipped} skipped.
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button nativeButton={false} render={<Link href="/products" />}>
            Go to products
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/products/import" />}>
            Import another file
          </Button>
        </div>
      </div>
    );
  }

  if (state.step === "preview" && state.preview && state.summary) {
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge>{state.summary.create} to create</Badge>
          <Badge variant="secondary">{state.summary.update} to update</Badge>
          <Badge variant={state.summary.error ? "destructive" : "outline"}>{state.summary.error} with errors (skipped)</Badge>
        </div>
        <div className="max-h-96 overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.preview.map((row) => (
                <TableRow key={row.line}>
                  <TableCell>{row.line}</TableCell>
                  <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>
                    {row.action === "error" ? <span className="text-destructive">{row.error}</span> : <Badge variant={row.action === "create" ? "default" : "secondary"}>{row.action}</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <form action={formAction} className="flex gap-2">
          <input type="hidden" name="step" value="commit" />
          <input type="hidden" name="payload" value={state.payload ?? "[]"} />
          <Button type="submit" disabled={pending || state.summary.create + state.summary.update === 0}>
            {pending ? "Importing…" : `Import ${state.summary.create + state.summary.update} rows`}
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/products/import" />}>
            Start over
          </Button>
        </form>
        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="step" value="preview" />
      <input type="file" name="file" accept=".csv,text/csv" required className="block text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5" />
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Reading…" : "Preview import"}
        </Button>
      </div>
    </form>
  );
}
