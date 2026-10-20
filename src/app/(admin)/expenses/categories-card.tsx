"use client";

import { PlusIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveExpenseCategoryAction, setExpenseCategoryActiveAction, type CategoryFormState } from "./actions";

type Category = { id: string; name: string; isActive: boolean; usage: number };

export function ExpenseCategoriesCard({ categories }: { categories: Category[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<CategoryFormState, FormData>(async (prev, fd) => {
    const r = await saveExpenseCategoryAction(prev, fd);
    if (r.ok) {
      toast.success("Category saved.", { id: "expense-category" });
      setEditing(null);
    }
    return r;
  }, { error: null });

  return (
    <Card>
      <CardHeader><CardTitle>Expense categories</CardTitle><CardDescription>Rent, utilities, salaries, marketing… Inactive categories stay on old expenses but cannot be chosen for new ones.</CardDescription></CardHeader>
      <CardContent className="grid gap-3">
        <form action={formAction} className="flex gap-2">
          <Input name="name" placeholder="New category" required maxLength={80} aria-label="New category name" data-scanner-ignore />
          <Button type="submit" variant="outline" disabled={pending}><PlusIcon /> Add</Button>
        </form>
        {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
        <ul className="divide-y rounded-lg border">
          {categories.length === 0 ? <li className="p-3 text-sm text-muted-foreground">No categories yet.</li> : null}
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 p-2 text-sm">
              {editing === c.id ? (
                <form action={formAction} className="flex flex-1 gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <Input name="name" defaultValue={c.name} required maxLength={80} autoFocus aria-label="Category name" data-scanner-ignore />
                  <Button type="submit" size="sm" disabled={pending}>Save</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </form>
              ) : (
                <>
                  <span className="flex items-center gap-2"><span className={c.isActive ? "" : "text-muted-foreground line-through"}>{c.name}</span><Badge variant="outline">{c.usage}</Badge></span>
                  <span className="flex gap-1">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(c.id)}>Rename</Button>
                    <form action={setExpenseCategoryActiveAction}>
                      <input type="hidden" name="categoryId" value={c.id} />
                      <input type="hidden" name="active" value={c.isActive ? "false" : "true"} />
                      <Button type="submit" size="sm" variant="ghost">{c.isActive ? "Deactivate" : "Activate"}</Button>
                    </form>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
