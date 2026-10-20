"use client";

import { PlusIcon } from "lucide-react";
import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveCategoryAction, setCategoryActiveAction, type CategoryState } from "../actions";

type Category = { id: string; name: string; isActive: boolean };

export function CategoriesManager({ categories }: { categories: Category[] }) {
  const [state, formAction, pending] = useActionState<CategoryState, FormData>(saveCategoryAction, { error: null });

  return (
    <div className="grid gap-4">
      <form action={formAction} className="flex items-end gap-2">
        <div className="grid flex-1 gap-1">
          <label htmlFor="new-category" className="text-sm font-medium">
            New category
          </label>
          <Input id="new-category" name="name" required maxLength={80} placeholder="e.g. Beverages" />
        </div>
        <Button type="submit" disabled={pending}>
          <PlusIcon /> Add
        </Button>
      </form>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                No categories yet.
              </TableCell>
            </TableRow>
          ) : null}
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CategoryRow({ category }: { category: Category }) {
  const [state, formAction, pending] = useActionState<CategoryState, FormData>(saveCategoryAction, { error: null });
  return (
    <TableRow>
      <TableCell>
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={category.id} />
          <Input name="name" defaultValue={category.name} maxLength={80} className="max-w-xs" aria-label={`Rename ${category.name}`} />
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            Rename
          </Button>
          {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
        </form>
      </TableCell>
      <TableCell>
        <Badge variant={category.isActive ? "outline" : "secondary"}>{category.isActive ? "Active" : "Inactive"}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <form action={setCategoryActiveAction} className="inline">
          <input type="hidden" name="categoryId" value={category.id} />
          <input type="hidden" name="active" value={category.isActive ? "false" : "true"} />
          <Button type="submit" variant="ghost" size="sm">
            {category.isActive ? "Deactivate" : "Activate"}
          </Button>
        </form>
      </TableCell>
    </TableRow>
  );
}
