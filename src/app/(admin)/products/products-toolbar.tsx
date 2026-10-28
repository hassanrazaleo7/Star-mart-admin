"use client";

import { ScanBarcodeIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CameraScannerDialog } from "@/components/camera-scanner-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";

type Option = { id: string; name: string };
type Props = {
  values: { q?: string; category?: string; supplier?: string; status: string; low?: string; sort: string; dir: string };
  categories: Option[];
  suppliers: Option[];
  basePath?: string;
};

/** GET filter form; a wedge or camera scan jumps straight to the scanned code. */
export function ProductsToolbar({ values, categories, suppliers, basePath = "/products" }: Props) {
  const router = useRouter();
  const [scanOpen, setScanOpen] = useState(false);
  const goTo = (code: string) => router.push(`${basePath}?q=${encodeURIComponent(code)}&status=all`);
  useBarcodeScanner(goTo);

  return (
    <form method="get" action={basePath} className="flex flex-wrap items-end gap-2">
      <div className="flex min-w-60 flex-1 items-center gap-2">
        <Input name="q" defaultValue={values.q ?? ""} placeholder="Search name, SKU or barcode" aria-label="Search" data-scanner-ignore />
        <Button type="button" variant="outline" size="icon" aria-label="Scan barcode" onClick={() => setScanOpen(true)}>
          <ScanBarcodeIcon />
        </Button>
      </div>
      <NativeSelect name="category" defaultValue={values.category ?? ""} aria-label="Category">
        <NativeSelectOption value="">All categories</NativeSelectOption>
        {categories.map((c) => (
          <NativeSelectOption key={c.id} value={c.id}>
            {c.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {suppliers.length ? (
        <NativeSelect name="supplier" defaultValue={values.supplier ?? ""} aria-label="Supplier">
          <NativeSelectOption value="">All suppliers</NativeSelectOption>
          {suppliers.map((s) => (
            <NativeSelectOption key={s.id} value={s.id}>
              {s.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      ) : null}
      <NativeSelect name="status" defaultValue={values.status} aria-label="Status">
        <NativeSelectOption value="active">Active</NativeSelectOption>
        <NativeSelectOption value="draft">Draft</NativeSelectOption>
        <NativeSelectOption value="archived">Archived</NativeSelectOption>
        <NativeSelectOption value="all">All</NativeSelectOption>
      </NativeSelect>
      <NativeSelect name="sort" defaultValue={values.sort} aria-label="Sort">
        <NativeSelectOption value="name">Name</NativeSelectOption>
        <NativeSelectOption value="sku">SKU</NativeSelectOption>
        <NativeSelectOption value="price">Price</NativeSelectOption>
        <NativeSelectOption value="stock">Stock</NativeSelectOption>
        <NativeSelectOption value="updated">Recently updated</NativeSelectOption>
      </NativeSelect>
      <NativeSelect name="dir" defaultValue={values.dir} aria-label="Direction">
        <NativeSelectOption value="asc">Ascending</NativeSelectOption>
        <NativeSelectOption value="desc">Descending</NativeSelectOption>
      </NativeSelect>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="low" value="1" defaultChecked={values.low === "1"} className="size-4 rounded border" />
        Low stock only
      </label>
      <Button type="submit" variant="secondary">
        <SearchIcon />
        Filter
      </Button>
      <CameraScannerDialog open={scanOpen} onOpenChange={setScanOpen} onDetected={goTo} />
    </form>
  );
}
