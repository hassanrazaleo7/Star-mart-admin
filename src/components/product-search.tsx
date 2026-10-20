"use client";

import { SearchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ProductSearchRow } from "@/lib/products/queries";
import { formatPKR } from "@/lib/money";

type Props = {
  search: (query: string) => Promise<ProductSearchRow[]>;
  onPick: (product: ProductSearchRow) => void;
  placeholder?: string;
  autoFocus?: boolean;
  inputId?: string;
  showStock?: boolean;
  className?: string;
};

/** Debounced product lookup with keyboard navigation; Enter picks the highlighted row. */
export function ProductSearch({ search, onPick, placeholder = "Search by name, SKU or barcode", autoFocus, inputId, showStock = true, className }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchRow[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = ++seq.current;
    const t = window.setTimeout(async () => {
      setBusy(true);
      try {
        const rows = await search(q);
        if (seq.current === id) {
          setResults(rows);
          setActive(0);
          setOpen(true);
        }
      } finally {
        if (seq.current === id) setBusy(false);
      }
    }, 180);
    return () => window.clearTimeout(t);
  }, [query, search]);

  function pick(row: ProductSearchRow) {
    onPick(row);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={inputId}
          value={query}
          autoFocus={autoFocus}
          autoComplete="off"
          data-scanner-ignore
          placeholder={placeholder}
          className="pl-8"
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim().length < 2) {
              setResults([]);
              setOpen(false);
            }
          }}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && open && results[active]) {
              e.preventDefault();
              pick(results[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {busy ? <Spinner className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" /> : null}
      </div>
      {open && results.length > 0 ? (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10">
          {results.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left ${i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent"}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r)}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {r.sku}
                    {r.barcode ? ` · ${r.barcode}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block tabular-nums">{formatPKR(r.pricePaisa)}</span>
                  {showStock ? <span className="block text-xs text-muted-foreground">{r.stockQty} {r.unit}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
