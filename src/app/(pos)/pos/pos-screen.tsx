"use client";

import { ArrowLeftIcon, CameraIcon, KeyboardIcon, LogOutIcon, PauseIcon, PrinterIcon, Trash2Icon, UserRoundIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { CameraScannerDialog } from "@/components/camera-scanner-dialog";
import { CustomerPicker } from "@/components/customer-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import type { CustomerLite } from "@/lib/customers/queries";
import { maxRedeemablePoints } from "@/lib/loyalty/points";
import { formatPKR, paisaToDecimalString, parseMoneyInput } from "@/lib/money";
import { priceCart, type PricingSettings } from "@/lib/orders/pricing";
import type { ProductSearchRow } from "@/lib/products/queries";
import type { CloseShiftResult, PosSaleResult, ShiftActionResult } from "./actions";
import { CloseShiftDialog, OpenShiftDialog, type ShiftInfo } from "./shift-dialogs";
import type { ShiftSummary } from "@/lib/shifts/queries";
import { PaymentDialog } from "./payment-dialog";
import { initialPosState, posReducer, type HeldSale } from "./pos-reducer";
import { POS_HOTKEYS, usePosHotkeys } from "./use-pos-hotkeys";

type DiscountCheckResult = { ok: true; code: string; kind: "percent" | "fixed"; value: number; maxDiscountPaisa: number | null; minOrderPaisa: number; discountPaisa: number } | { ok: false; message: string };

type Props = {
  settings: PricingSettings & { storeName: string; currencySymbol: string };
  user: { id: string; name: string; role: string };
  canOverridePrices: boolean;
  createSale: (input: unknown) => Promise<PosSaleResult>;
  initialShift: ShiftInfo | null;
  openShift: (input: unknown) => Promise<ShiftActionResult>;
  closeShift: (input: unknown) => Promise<CloseShiftResult>;
  loadShiftSummary: (id: string) => Promise<{ ok: true; summary: ShiftSummary; number: string; openingFloatPaisa: number } | { ok: false; error: string }>;
  checkDiscount: (code: string, subtotalPaisa: number) => Promise<DiscountCheckResult>;
  logout: () => Promise<void>;
};

async function fetchProducts(q: string): Promise<ProductSearchRow[]> {
  const r = await fetch(`/api/pos/products?q=${encodeURIComponent(q)}`, { cache: "no-store" });
  if (!r.ok) return [];
  return ((await r.json()) as { products: ProductSearchRow[] }).products;
}
async function fetchByBarcode(code: string): Promise<ProductSearchRow | null> {
  const r = await fetch(`/api/pos/products?barcode=${encodeURIComponent(code)}`, { cache: "no-store" });
  if (!r.ok) return null;
  return ((await r.json()) as { product: ProductSearchRow | null }).product;
}
async function fetchCustomers(q: string): Promise<CustomerLite[]> {
  const r = await fetch(`/api/pos/customers?q=${encodeURIComponent(q)}`, { cache: "no-store" });
  if (!r.ok) return [];
  return ((await r.json()) as { customers: CustomerLite[] }).customers;
}

type LastSale = { orderId: string; number: string; totalPaisa: number; changePaisa: number; pointsEarned: number };

export function PosScreen({ settings, user, canOverridePrices, createSale, initialShift, openShift, closeShift, loadShiftSummary, checkDiscount, logout }: Props) {
  const [state, dispatch] = useReducer(posReducer, initialPosState);
  const [shift, setShift] = useState<ShiftInfo | null>(initialShift);
  const [closeOpen, setCloseOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchRow[]>([]);
  const [activeResult, setActiveResult] = useState(0);
  const [codeInput, setCodeInput] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [paySession, setPaySession] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<LastSale | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const heldKey = `pos-held:${user.id}`;

  // Held sales survive reloads (per cashier, this browser only).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(heldKey);
      if (raw) dispatch({ type: "loadHeld", held: JSON.parse(raw) as HeldSale[] });
    } catch {}
  }, [heldKey]);
  useEffect(() => {
    try {
      window.localStorage.setItem(heldKey, JSON.stringify(state.held));
    } catch {}
  }, [state.held, heldKey]);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const id = ++seq.current;
    const t = window.setTimeout(async () => {
      const rows = await fetchProducts(q);
      if (seq.current === id) {
        setResults(rows);
        setActiveResult(0);
      }
    }, 150);
    return () => window.clearTimeout(t);
  }, [query]);

  const addProduct = useCallback((p: ProductSearchRow) => {
    dispatch({ type: "add", product: p });
    // Expired units stay on the shelf until written off; remind the cashier to take a fresh one.
    if (p.expiredQty > 0) toast.warning(`${p.expiredQty} ${p.unit} of ${p.name} in stock is expired. Do not sell those units.`, { id: `expired-${p.id}` });
    setQuery("");
    setResults([]);
  }, []);

  const scan = useCallback(async (code: string) => {
    const p = await fetchByBarcode(code);
    if (p) {
      addProduct(p);
      toast.success(`Added ${p.name}`, { id: "scan" });
    } else toast.error(`No product with barcode ${code}`, { id: "scan" });
  }, [addProduct]);
  useBarcodeScanner((code) => void scan(code));

  const cart = priceCart({ lines: state.lines, discount: state.discount, pointsToRedeem: state.points, customer: state.customer, fulfillment: "pickup", settings });
  const maxPoints = state.customer ? maxRedeemablePoints(state.customer.pointsBalance, cart.subtotalPaisa - cart.discountPaisa, settings.loyalty) : 0;
  const closeDialogs = () => { setPayOpen(false); setCameraOpen(false); setHeldOpen(false); setHelpOpen(false); };
  const openPay = () => {
    if (!state.lines.length || cart.issues.length > 0 || !shift) return;
    setSaleError(null);
    setPaySession((n) => n + 1);
    setPayOpen(true);
  };

  usePosHotkeys({
    focusSearch: () => searchRef.current?.focus(),
    focusCustomer: () => document.getElementById(state.guest ? "pos-guest-name" : "pos-customer")?.focus(),
    openCamera: () => setCameraOpen(true),
    focusDiscount: () => discountRef.current?.focus(),
    openPayment: openPay,
    escape: closeDialogs,
    stepQty: (delta) => { if (state.activeId) dispatch({ type: "step", id: state.activeId, delta }); },
    removeActive: () => { if (state.activeId) dispatch({ type: "remove", id: state.activeId }); },
    hold: () => { dispatch({ type: "hold" }); toast.info("Sale held", { id: "hold" }); },
    openHeld: () => setHeldOpen(true),
  });

  async function applyCode(raw?: string) {
    const code = (raw ?? codeInput).trim().toUpperCase();
    if (!code) return;
    const r = await checkDiscount(code, cart.subtotalPaisa - cart.manualDiscountPaisa);
    if (r.ok) {
      dispatch({ type: "setDiscount", discount: { code: r.code, kind: r.kind, value: r.value, maxDiscountPaisa: r.maxDiscountPaisa, minOrderPaisa: r.minOrderPaisa }, note: `${r.code} applied: −${formatPKR(r.discountPaisa)}` });
      setCodeInput("");
    } else dispatch({ type: "setDiscount", discount: null, note: r.message });
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveResult((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveResult((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const q = query.trim();
      if (results[activeResult] && results.length > 0 && seq.current) addProduct(results[activeResult]);
      else if (q.length >= 4) void scan(q).then(() => { setQuery(""); setResults([]); });
    } else if (e.key === "Escape") { setQuery(""); setResults([]); }
  }

  function complete(payments: { method: "cash" | "card" | "bank_transfer" | "credit"; amountPaisa: number; reference: string | null }[]) {
    setSaleError(null);
    startTransition(async () => {
      const guest = state.guest ? { name: state.guest.name.trim() || undefined, phone: state.guest.phone.trim() || undefined, email: state.guest.email.trim() || undefined } : undefined;
      const result = await createSale({
        customerId: state.customer?.id ?? undefined,
        guest,
        discountCode: state.discount?.code ?? undefined,
        pointsToRedeem: state.points,
        notes: state.notes || undefined,
        lines: state.lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPricePaisa: canOverridePrices && l.unitPricePaisa !== l.listPricePaisa ? l.unitPricePaisa : null, lineDiscountPaisa: canOverridePrices ? l.lineDiscountPaisa : 0 })),
        payments,
      });
      if (!result.ok) {
        if (result.code === "no_shift") {
          setPayOpen(false);
          setShift(null);
          toast.error(result.error, { id: "shift" });
          return;
        }
        setSaleError(result.error);
        return;
      }
      setPayOpen(false);
      setLastSale({ orderId: result.orderId, number: result.number, totalPaisa: result.totalPaisa, changePaisa: result.changePaisa, pointsEarned: result.pointsEarned });
      setReceiptUrl(`/print/pos/receipt/${result.orderId}?print=1&t=${Date.now()}`);
      dispatch({ type: "clear" });
      toast.success(`Sale ${result.number} completed`, { id: "sale" });
      window.setTimeout(() => searchRef.current?.focus(), 50);
    });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-3">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard" />}><ArrowLeftIcon /> Back</Button>
        <span className="font-heading font-semibold">{settings.storeName} · Point of sale</span>
        <Badge variant="outline">{user.name}</Badge>
        {shift ? <Badge variant="secondary" data-testid="shift-badge">{shift.number} · open since {new Date(shift.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · float {formatPKR(shift.openingFloatPaisa)}</Badge> : <Badge variant="destructive">No open shift</Badge>}
        <div className="ml-auto flex items-center gap-1">
          {shift ? <Button variant="outline" size="sm" onClick={() => setCloseOpen(true)}>Close shift</Button> : null}
          <Button variant="ghost" size="sm" onClick={() => setHeldOpen(true)}><PauseIcon /> Held {state.held.length ? <Badge>{state.held.length}</Badge> : null}</Button>
          {lastSale ? <Button variant="ghost" size="sm" onClick={() => setReceiptUrl(`/print/pos/receipt/${lastSale.orderId}?print=1&t=${Date.now()}`)}><PrinterIcon /> Reprint {lastSale.number}</Button> : null}
          <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)} aria-label="Keyboard shortcuts"><KeyboardIcon /></Button>
          <form action={logout}><Button variant="ghost" size="sm" type="submit"><LogOutIcon /> Sign out</Button></form>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_24rem]">
        <section className="flex min-h-0 flex-col border-r">
          <div className="relative border-b p-3">
            <Input ref={searchRef} id="pos-search" value={query} autoFocus autoComplete="off" data-scanner-ignore placeholder="Scan a barcode or search by name / SKU  (F2)" className="h-11 text-base" onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) setResults([]); }} onKeyDown={onSearchKeyDown} />
            <Button type="button" variant="outline" size="icon" aria-label="Scan with camera" className="absolute top-3 right-3 h-11 w-11" onClick={() => setCameraOpen(true)}><CameraIcon /></Button>
            {results.length > 0 && query.trim() ? (
              <ul role="listbox" className="absolute right-3 left-3 z-20 mt-1 max-h-80 overflow-auto rounded-lg bg-popover p-1 text-sm shadow-md ring-1 ring-foreground/10">
                {results.map((r, i) => (
                  <li key={r.id} role="option" aria-selected={i === activeResult}>
                    <button type="button" className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left ${i === activeResult ? "bg-accent" : "hover:bg-accent"}`} onMouseEnter={() => setActiveResult(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => addProduct(r)}>
                      <span className="min-w-0"><span className="block truncate font-medium">{r.name}</span><span className="font-mono text-xs text-muted-foreground">{r.sku}{r.barcode ? ` · ${r.barcode}` : ""}</span></span>
                      <span className="shrink-0 text-right"><span className="block tabular-nums">{formatPKR(r.pricePaisa)}</span><span className={`block text-xs ${r.stockQty <= 0 ? "text-destructive" : "text-muted-foreground"}`}>{r.stockQty} {r.unit}</span>{r.expiredQty > 0 ? <span className="block text-xs text-destructive">{r.expiredQty} expired</span> : null}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="w-36">Qty</TableHead><TableHead className="w-32 text-right">Price</TableHead>{canOverridePrices ? <TableHead className="w-28 text-right">Line disc.</TableHead> : null}<TableHead className="w-32 text-right">Amount</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
              <TableBody>
                {state.lines.length === 0 ? <TableRow><TableCell colSpan={canOverridePrices ? 6 : 5} className="h-32 text-center text-muted-foreground">Cart is empty. Scan a barcode or search above.</TableCell></TableRow> : null}
                {cart.lines.map((l) => (
                  <TableRow key={l.productId} data-state={l.productId === state.activeId ? "selected" : undefined} onClick={() => dispatch({ type: "setActive", id: l.productId })} className="cursor-pointer">
                    <TableCell><div className="font-medium">{l.name}</div><div className="font-mono text-xs text-muted-foreground">{l.sku}{l.stockQty < l.qty ? <span className="ml-2 text-destructive">only {l.stockQty} {l.unit} in stock</span> : null}</div></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="outline" size="icon-sm" aria-label={`Decrease ${l.name}`} onClick={(e) => { e.stopPropagation(); dispatch({ type: "step", id: l.productId, delta: -1 }); }}>−</Button>
                        <Input type="number" min={0} step={l.allowFractional ? 0.001 : 1} value={state.lines.find((x) => x.productId === l.productId)?.qty ?? 0} aria-label={`Quantity for ${l.name}`} className="h-8 w-16 px-1 text-center" data-scanner-ignore onClick={(e) => e.stopPropagation()} onChange={(e) => dispatch({ type: "setQty", id: l.productId, qty: Number(e.target.value) })} />
                        <Button type="button" variant="outline" size="icon-sm" aria-label={`Increase ${l.name}`} onClick={(e) => { e.stopPropagation(); dispatch({ type: "step", id: l.productId, delta: 1 }); }}>+</Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {canOverridePrices ? <Input inputMode="decimal" defaultValue={paisaToDecimalString(l.unitPricePaisa)} aria-label={`Price for ${l.name}`} className="h-8 text-right" data-scanner-ignore onClick={(e) => e.stopPropagation()} onBlur={(e) => { try { dispatch({ type: "setPrice", id: l.productId, unitPricePaisa: parseMoneyInput(e.target.value || "0") }); } catch { e.target.value = paisaToDecimalString(l.unitPricePaisa); } }} /> : <span className="tabular-nums">{formatPKR(l.unitPricePaisa)}</span>}
                    </TableCell>
                    {canOverridePrices ? <TableCell className="text-right"><Input inputMode="decimal" defaultValue="0.00" aria-label={`Discount for ${l.name}`} className="h-8 text-right" data-scanner-ignore onClick={(e) => e.stopPropagation()} onBlur={(e) => { try { dispatch({ type: "setLineDiscount", id: l.productId, paisa: parseMoneyInput(e.target.value || "0") }); } catch { e.target.value = "0.00"; } }} /></TableCell> : null}
                    <TableCell className="text-right font-medium tabular-nums">{formatPKR(l.netPaisa)}</TableCell>
                    <TableCell><Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${l.name}`} onClick={(e) => { e.stopPropagation(); dispatch({ type: "remove", id: l.productId }); }}><Trash2Icon /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
        <aside className="flex min-h-0 flex-col gap-3 overflow-auto bg-muted/30 p-3">
          <div className="grid gap-2 rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between text-sm font-medium"><span>Customer</span>{state.guest ? <Badge variant="secondary">Guest</Badge> : <Kbd>F4</Kbd>}</div>
            {state.guest ? (
              <div className="grid gap-2" data-testid="pos-guest">
                <div className="flex gap-2">
                  <Input id="pos-guest-name" placeholder="Guest name (optional)" value={state.guest.name} onChange={(e) => dispatch({ type: "setGuest", guest: { name: e.target.value } })} maxLength={120} autoFocus data-scanner-ignore />
                  <Button type="button" variant="ghost" size="icon" aria-label="Use account instead" onClick={() => dispatch({ type: "setGuest", guest: null })}><XIcon /></Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input id="pos-guest-phone" placeholder="Phone" inputMode="tel" value={state.guest.phone} onChange={(e) => dispatch({ type: "setGuest", guest: { phone: e.target.value } })} maxLength={40} data-scanner-ignore />
                  <Input id="pos-guest-email" placeholder="Email for receipt" type="email" value={state.guest.email} onChange={(e) => dispatch({ type: "setGuest", guest: { email: e.target.value } })} maxLength={254} data-scanner-ignore />
                </div>
                <p className="text-xs text-muted-foreground">Printed on the receipt and used for the receipt email only. No points or credit.</p>
              </div>
            ) : (
              <div className="grid gap-2">
                <CustomerPicker search={fetchCustomers} value={state.customer} onChange={(c) => dispatch({ type: "setCustomer", customer: c })} canSetCredit={canOverridePrices} inputId="pos-customer" compact />
                {!state.customer ? <Button type="button" variant="outline" size="sm" className="justify-start" onClick={() => dispatch({ type: "setGuest", guest: {} })}><UserRoundIcon /> Guest checkout</Button> : null}
              </div>
            )}
          </div>
          <div className="grid gap-2 rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between text-sm font-medium"><span>Discount code</span><Kbd>F8</Kbd></div>
            <div className="flex gap-2">
              <Input ref={discountRef} id="pos-discount" value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applyCode(); } }} placeholder="CODE" className="font-mono uppercase" data-scanner-ignore />
              <Button type="button" variant="outline" onClick={() => void applyCode()}>Apply</Button>
              {state.discount ? <Button type="button" variant="ghost" size="icon" aria-label="Remove discount" onClick={() => dispatch({ type: "setDiscount", discount: null, note: null })}><XIcon /></Button> : null}
            </div>
            {state.discountNote ? <p className={`text-xs ${state.discount ? "text-muted-foreground" : "text-destructive"}`}>{state.discountNote}</p> : null}
            {state.customer && settings.loyalty.enabled ? (
              <div className="grid gap-1">
                <label htmlFor="pos-points" className="text-sm font-medium">Redeem points <span className="font-normal text-muted-foreground">({state.customer.pointsBalance} available, max {maxPoints})</span></label>
                <Input id="pos-points" type="number" min={0} max={maxPoints} step={1} value={state.points} disabled={maxPoints === 0} onChange={(e) => dispatch({ type: "setPoints", points: Number(e.target.value) })} data-scanner-ignore />
              </div>
            ) : null}
          </div>
          <div className="grid gap-1 rounded-lg border bg-card p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatPKR(cart.subtotalPaisa)}</span></div>
            {cart.discountPaisa ? <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">−{formatPKR(cart.discountPaisa)}</span></div> : null}
            {cart.pointsValuePaisa ? <div className="flex justify-between"><span className="text-muted-foreground">Points ({cart.pointsRedeemed})</span><span className="tabular-nums">−{formatPKR(cart.pointsValuePaisa)}</span></div> : null}
            <div className="mt-1 flex justify-between border-t pt-2 text-2xl font-bold"><span>Total</span><span className="tabular-nums" data-testid="pos-total">{formatPKR(cart.totalPaisa)}</span></div>
            <div className="flex justify-between text-xs text-muted-foreground"><span>Includes tax</span><span className="tabular-nums">{formatPKR(cart.taxPaisa)}</span></div>
            {state.customer && cart.pointsEarned ? <div className="flex justify-between text-xs text-muted-foreground"><span>Points to earn</span><span>{cart.pointsEarned}</span></div> : null}
            {cart.issues.map((i) => <p key={i} className="text-xs text-destructive">{i}</p>)}
          </div>
          <div className="mt-auto grid grid-cols-3 gap-2">
            <Button type="button" variant="outline" disabled={!state.lines.length} onClick={() => { dispatch({ type: "hold" }); toast.info("Sale held", { id: "hold" }); }}>Hold <Kbd>^H</Kbd></Button>
            <Button type="button" variant="outline" disabled={!state.lines.length} onClick={() => dispatch({ type: "clear" })}>Clear</Button>
            {!shift ? <p className="col-span-3 text-center text-xs text-destructive">Open a shift to start selling.</p> : null}
            <Button type="button" size="lg" className="col-span-3 h-14 text-lg" disabled={!shift || !state.lines.length || cart.issues.length > 0} onClick={openPay}>Pay {formatPKR(cart.totalPaisa)} <Kbd className="bg-primary-foreground/20 text-primary-foreground">F9</Kbd></Button>
          </div>
          {lastSale ? (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm" data-testid="pos-last-sale">
              <div className="font-medium">Last sale {lastSale.number}: {formatPKR(lastSale.totalPaisa)}</div>
              {lastSale.changePaisa ? <div className="text-lg font-bold">Change {formatPKR(lastSale.changePaisa)}</div> : null}
              {lastSale.pointsEarned ? <div className="text-xs text-muted-foreground">{lastSale.pointsEarned} points earned</div> : null}
            </div>
          ) : null}
        </aside>
      </div>
      <OpenShiftDialog open={!shift} onOpened={setShift} openShift={openShift} />
      {shift ? <CloseShiftDialog open={closeOpen} onOpenChange={setCloseOpen} shift={shift} loadSummary={loadShiftSummary} closeShift={closeShift} /> : null}
      <PaymentDialog key={paySession} open={payOpen} onOpenChange={setPayOpen} totalPaisa={cart.totalPaisa} customer={state.customer} busy={busy} error={saleError} onComplete={complete} />
      <CameraScannerDialog open={cameraOpen} onOpenChange={setCameraOpen} onDetected={(code) => void scan(code)} closeOnDetect={false} />
      <Sheet open={heldOpen} onOpenChange={setHeldOpen}>
        <SheetContent>
          <SheetHeader><SheetTitle>Held sales</SheetTitle><SheetDescription>Resume a parked cart. Held sales live in this browser only.</SheetDescription></SheetHeader>
          <div className="grid gap-2 p-4">
            {state.held.length === 0 ? <p className="text-sm text-muted-foreground">Nothing on hold.</p> : null}
            {state.held.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div><div className="font-medium">{h.lines.length} line{h.lines.length === 1 ? "" : "s"}{h.customer ? ` · ${h.customer.name}` : h.guest?.name ? ` · ${h.guest.name} (guest)` : h.guest ? " · guest" : ""}</div><div className="text-xs text-muted-foreground">{new Date(h.heldAt).toLocaleTimeString()} · {formatPKR(h.lines.reduce((s, l) => s + Math.round(l.unitPricePaisa * l.qty), 0))}</div></div>
                <div className="flex gap-1">
                  <Button size="sm" onClick={() => { dispatch({ type: "resume", id: h.id }); setHeldOpen(false); }}>Resume</Button>
                  <Button size="sm" variant="ghost" aria-label="Discard held sale" onClick={() => dispatch({ type: "dropHeld", id: h.id })}><Trash2Icon /></Button>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle><DialogDescription>Scanners work anywhere on this screen.</DialogDescription></DialogHeader>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">{POS_HOTKEYS.map(([k, v]) => <div key={k} className="contents"><dt><Kbd>{k}</Kbd></dt><dd className="text-muted-foreground">{v}</dd></div>)}</dl>
          <DialogFooter><Button onClick={() => setHelpOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {receiptUrl ? <iframe key={receiptUrl} src={receiptUrl} title="Receipt" data-testid="receipt-frame" className="pointer-events-none fixed h-0 w-0 opacity-0" aria-hidden /> : null}
    </div>
  );
}
