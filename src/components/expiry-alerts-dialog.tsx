"use client";

import Link from "next/link";
import { useState } from "react";
import { BellRingIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ExpiringItem = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  shelfNumber: string | null;
  purchaseId: string | null;
  purchaseNumber: string | null;
  batch: string | null;
  expiry: string | null;
  daysToExpiry: number;
  source: "Product" | "Purchase batch";
};

export function ExpiryAlertsDialog({ items, days, limit }: { items: ExpiringItem[]; days: number; limit: number }) {
  const [open, setOpen] = useState(items.length > 0);

  if (!items.length) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label={`Show ${items.length} products nearing expiry`}>
        <BellRingIcon />
        Expiry alerts
        <span className="rounded-full bg-destructive px-1.5 text-xs text-destructive-foreground">{items.length}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Products nearing expiry</DialogTitle>
            <DialogDescription>
              Showing up to {limit} products and received purchase batches expiring within {days} days. Stock is tracked per product, not by remaining batch quantity.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] divide-y overflow-y-auto">
            {items.map((item) => (
              <div key={item.id} className="grid gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/products/${item.productId}/edit`} className="font-medium hover:underline">
                    {item.productName}
                  </Link>
                  <span className="text-sm font-medium text-destructive">
                    {item.daysToExpiry === 0 ? "Expires today" : `Expires in ${item.daysToExpiry} days`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  SKU {item.sku}
                  {item.shelfNumber ? ` · Shelf ${item.shelfNumber}` : ""}
                  {` · ${item.source}`}
                  {item.batch ? ` · Batch ${item.batch}` : ""}
                  {item.expiry ? ` · ${item.expiry}` : ""}
                </p>
                {item.purchaseId && item.purchaseNumber ? (
                  <Link href={`/purchases/${item.purchaseId}`} className="w-fit text-xs underline underline-offset-2">
                    Purchase {item.purchaseNumber}
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
