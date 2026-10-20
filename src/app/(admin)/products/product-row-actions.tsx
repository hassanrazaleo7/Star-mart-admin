"use client";

import { MoreHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteProductAction, setProductStatusAction } from "./actions";

type Props = { product: { id: string; name: string; status: string }; canManage: boolean };

export function ProductRowActions({ product, canManage }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Actions" />}>
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href={`/products/${product.id}/edit`} />}>{canManage ? "Edit" : "View"}</DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/print/labels?ids=${product.id}`} target="_blank" />}>Print label</DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/stock/movements?product=${product.id}`} />}>Stock ledger</DropdownMenuItem>
          {canManage ? (
            <>
              <DropdownMenuSeparator />
              <form action={setProductStatusAction}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="status" value={product.status === "archived" ? "active" : "archived"} />
                <DropdownMenuItem nativeButton render={<button type="submit" className="w-full" />}>{product.status === "archived" ? "Restore" : "Archive"}</DropdownMenuItem>
              </form>
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {product.name}?</AlertDialogTitle>
            <AlertDialogDescription>Products that appear on purchases, orders or stock movements are archived instead of deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form action={deleteProductAction}>
              <input type="hidden" name="productId" value={product.id} />
              <AlertDialogAction type="submit" variant="destructive">
                Delete
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
