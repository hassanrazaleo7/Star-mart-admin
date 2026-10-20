"use client";

import { SearchIcon, UserPlusIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { CustomerLite } from "@/lib/customers/queries";
import { formatPKR } from "@/lib/money";
import { CustomerFormDialog } from "@/app/(admin)/customers/customer-form-dialog";

type Props = {
  search: (query: string) => Promise<CustomerLite[]>;
  value: CustomerLite | null;
  onChange: (customer: CustomerLite | null) => void;
  canCreate?: boolean;
  canSetCredit?: boolean;
  inputId?: string;
  compact?: boolean;
};

/** Search-as-you-type customer selector with an inline quick-create dialog. */
export function CustomerPicker({ search, value, onChange, canCreate = true, canSetCredit = false, inputId = "customer-search", compact = false }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerLite[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
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

  const pick = (c: CustomerLite) => {
    onChange(c);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  if (value) {
    const available = value.creditLimitPaisa - value.creditBalancePaisa;
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{value.name} <span className="text-xs font-normal text-muted-foreground">({value.type})</span></div>
          <div className="truncate text-xs text-muted-foreground">
            {[value.phone, value.email].filter(Boolean).join(" · ")}{value.phone || value.email ? " · " : ""}
            {value.pointsBalance} pts{value.creditLimitPaisa > 0 ? ` · credit ${formatPKR(Math.max(0, available))} available` : ""}
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove customer" onClick={() => onChange(null)}><XIcon /></Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={inputId}
          value={query}
          autoComplete="off"
          data-scanner-ignore
          placeholder={compact ? "Customer (name or phone)" : "Find a customer by name, phone or email"}
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
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter" && open && results[active]) { e.preventDefault(); pick(results[active]); }
            else if (e.key === "Escape") setOpen(false);
          }}
        />
        {busy ? <Spinner className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" /> : null}
        {open && results.length > 0 ? (
          <ul role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10">
            {results.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === active}>
                <button type="button" className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left ${i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent"}`} onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}>
                  <span className="flex min-w-0 flex-col"><span className="truncate font-medium">{c.name}</span><span className="text-xs text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(" · ")}</span></span>
                  <span className="shrink-0 text-xs text-muted-foreground">{c.pointsBalance} pts</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {open && !busy && results.length === 0 && query.trim().length >= 2 ? <div className="absolute z-30 mt-1 w-full rounded-lg bg-popover p-2 text-sm text-muted-foreground shadow-md ring-1 ring-foreground/10">No customers found.</div> : null}
      </div>
      {canCreate ? <CustomerFormDialog canSetCredit={canSetCredit} onCreated={pick} trigger={<Button type="button" variant="outline" aria-label="New customer"><UserPlusIcon /> New</Button>} /> : null}
    </div>
  );
}
