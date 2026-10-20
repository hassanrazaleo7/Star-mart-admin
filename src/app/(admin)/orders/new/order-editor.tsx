"use client";

import { ScanBarcodeIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { CameraScannerDialog } from "@/components/camera-scanner-dialog";
import { CustomerPicker } from "@/components/customer-picker";
import { ProductSearch } from "@/components/product-search";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import type { CustomerLite } from "@/lib/customers/queries";
import type { DiscountRule } from "@/lib/discounts/rules";
import { maxRedeemablePoints } from "@/lib/loyalty/points";
import { formatPKR, paisaToDecimalString, parseMoneyInput } from "@/lib/money";
import { priceCart, type PricingSettings } from "@/lib/orders/pricing";
import type { CartLine } from "@/lib/orders/types";
import type { ProductSearchRow } from "@/lib/products/queries";
import { createOrderAction, type OrderFormState } from "../actions";

type DiscountCheckResult = { ok: true; code: string; kind: "percent" | "fixed"; value: number; maxDiscountPaisa: number | null; minOrderPaisa: number; discountPaisa: number } | { ok: false; message: string };

type Props = {
  settings: PricingSettings;
  canOverridePrices: boolean;
  initialCustomer: CustomerLite | null;
  searchProducts: (q: string) => Promise<ProductSearchRow[]>;
  lookupBarcode: (code: string) => Promise<ProductSearchRow | null>;
  searchCustomers: (q: string) => Promise<CustomerLite[]>;
  checkDiscount: (code: string, subtotalPaisa: number) => Promise<DiscountCheckResult>;
};

const toLine = (p: ProductSearchRow): CartLine => ({ productId: p.id, name: p.name, sku: p.sku, unit: p.unit, allowFractional: p.allowFractional, qty: 1, unitPricePaisa: p.pricePaisa, listPricePaisa: p.pricePaisa, costPaisa: p.costPaisa, taxRateBps: p.taxRateBps, lineDiscountPaisa: 0, stockQty: p.stockQty });

export function OrderEditor({ settings, canOverridePrices, initialCustomer, searchProducts, lookupBarcode, searchCustomers, checkDiscount }: Props) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<CustomerLite | null>(initialCustomer);
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [discount, setDiscount] = useState<DiscountRule | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  const [points, setPoints] = useState(0);
  const [scanOpen, setScanOpen] = useState(false);
  const [state, formAction, pending] = useActionState<OrderFormState, FormData>(createOrderAction, { error: null });

  const add = (p: ProductSearchRow) =>
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) return prev.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, toLine(p)];
    });
  const update = (i: number, patch: Partial<CartLine>) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const scan = async (code: string) => {
    const p = await lookupBarcode(code);
    if (p) {
      add(p);
      toast.success(`Added ${p.name}`, { id: "scan-add" });
    } else toast.error(`No product with barcode ${code}`, { id: "scan-miss" });
  };
  useBarcodeScanner(scan);

  const cart = priceCart({ lines, discount, pointsToRedeem: points, customer, fulfillment, settings });
  const maxPoints = customer ? maxRedeemablePoints(customer.pointsBalance, cart.subtotalPaisa - cart.discountPaisa, settings.loyalty) : 0;
  const payload = lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPricePaisa: canOverridePrices && l.unitPricePaisa !== l.listPricePaisa ? l.unitPricePaisa : null, lineDiscountPaisa: canOverridePrices ? l.lineDiscountPaisa : 0 }));

  async function applyCode() {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    const r = await checkDiscount(code, cart.subtotalPaisa - cart.manualDiscountPaisa);
    if (r.ok) {
      setDiscount({ code: r.code, kind: r.kind, value: r.value, maxDiscountPaisa: r.maxDiscountPaisa, minOrderPaisa: r.minOrderPaisa });
      setCodeMessage(`${r.code} applied: −${formatPKR(r.discountPaisa)}`);
    } else {
      setDiscount(null);
      setCodeMessage(r.message);
    }
  }

  return (
    <form action={formAction} noValidate className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />
      <input type="hidden" name="customerId" value={customer?.id ?? ""} />
      <input type="hidden" name="discountCode" value={discount?.code ?? ""} />
      <input type="hidden" name="pointsToRedeem" value={points} />
      <div className="grid gap-6">
        <Card>
          <CardHeader><CardTitle>Customer</CardTitle><CardDescription>Optional for walk-in pickups; required for delivery, points and credit.</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            <CustomerPicker search={searchCustomers} value={customer} onChange={(c) => { setCustomer(c); setPoints(0); }} canSetCredit={canOverridePrices} />
            {!customer ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field><FieldLabel htmlFor="customerName">Name (no account)</FieldLabel><Input id="customerName" name="customerName" maxLength={120} data-scanner-ignore /></Field>
                <Field><FieldLabel htmlFor="customerPhone">Phone</FieldLabel><Input id="customerPhone" name="customerPhone" inputMode="tel" maxLength={40} data-scanner-ignore /></Field>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Items</CardTitle><CardDescription>Search, pick with Enter, or scan a barcode with a USB scanner or the camera.</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex gap-2">
              <ProductSearch search={searchProducts} onPick={add} className="flex-1" autoFocus inputId="order-product-search" />
              <Button type="button" variant="outline" size="icon" aria-label="Scan with camera" onClick={() => setScanOpen(true)}><ScanBarcodeIcon /></Button>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="w-28">Qty</TableHead><TableHead className="w-36">Unit price</TableHead>{canOverridePrices ? <TableHead className="w-32">Line discount</TableHead> : null}<TableHead className="text-right">Amount</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
              <TableBody>
                {lines.length === 0 ? <TableRow><TableCell colSpan={canOverridePrices ? 6 : 5} className="text-center text-muted-foreground">No items yet.</TableCell></TableRow> : null}
                {cart.lines.map((l, i) => (
                  <TableRow key={l.productId}>
                    <TableCell><div className="font-medium">{l.name}</div><div className="font-mono text-xs text-muted-foreground">{l.sku}{l.stockQty < l.qty ? <span className="ml-2 text-destructive">only {l.stockQty} {l.unit} in stock</span> : null}</div></TableCell>
                    <TableCell><Input type="number" min={0} step={l.allowFractional ? 0.001 : 1} value={lines[i]!.qty} onChange={(e) => update(i, { qty: Number(e.target.value) })} aria-label={`Quantity for ${l.name}`} data-scanner-ignore /></TableCell>
                    <TableCell>
                      {canOverridePrices ? <Input inputMode="decimal" defaultValue={paisaToDecimalString(l.unitPricePaisa)} aria-label={`Unit price for ${l.name}`} onBlur={(e) => { try { update(i, { unitPricePaisa: parseMoneyInput(e.target.value || "0") }); } catch { e.target.value = paisaToDecimalString(l.unitPricePaisa); } }} data-scanner-ignore /> : <span className="tabular-nums">{formatPKR(l.unitPricePaisa)}</span>}
                    </TableCell>
                    {canOverridePrices ? <TableCell><Input inputMode="decimal" defaultValue="0.00" aria-label={`Discount for ${l.name}`} onBlur={(e) => { try { update(i, { lineDiscountPaisa: parseMoneyInput(e.target.value || "0") }); } catch { e.target.value = "0.00"; } }} data-scanner-ignore /></TableCell> : null}
                    <TableCell className="text-right tabular-nums">{formatPKR(l.netPaisa)}</TableCell>
                    <TableCell><Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${l.name}`} onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}><Trash2Icon /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Fulfilment</CardTitle></CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="channel">Channel</FieldLabel>
                  <NativeSelect className="w-full" id="channel" name="channel" defaultValue="phone"><NativeSelectOption value="phone">Phone order</NativeSelectOption><NativeSelectOption value="walk_in">Walk-in</NativeSelectOption></NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="fulfillment">Pickup or delivery</FieldLabel>
                  <NativeSelect className="w-full" id="fulfillment" name="fulfillment" value={fulfillment} onChange={(e) => setFulfillment(e.target.value as "pickup" | "delivery")}><NativeSelectOption value="pickup">Pickup</NativeSelectOption><NativeSelectOption value="delivery">Delivery</NativeSelectOption></NativeSelect>
                </Field>
                <Field><FieldLabel htmlFor="scheduledFor">Scheduled for</FieldLabel><Input id="scheduledFor" name="scheduledFor" type="datetime-local" /></Field>
              </div>
              {fulfillment === "delivery" ? (
                <Field>
                  <FieldLabel htmlFor="deliveryAddress">Delivery address</FieldLabel>
                  <Textarea id="deliveryAddress" name="deliveryAddress" rows={2} defaultValue={customer?.address ?? ""} data-scanner-ignore />
                  <FieldDescription>Delivery fee {formatPKR(settings.delivery.feePaisa)}{settings.delivery.freeAbovePaisa != null ? `, free above ${formatPKR(settings.delivery.freeAbovePaisa)}` : ""}.</FieldDescription>
                </Field>
              ) : null}
              <Field><FieldLabel htmlFor="notes">Notes</FieldLabel><Textarea id="notes" name="notes" rows={2} data-scanner-ignore /></Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
      <div className="grid content-start gap-6">
        <Card>
          <CardHeader><CardTitle>Discount and points</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <Field>
              <FieldLabel htmlFor="discountCodeInput">Discount code</FieldLabel>
              <div className="flex gap-2">
                <Input id="discountCodeInput" value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase())} className="font-mono uppercase" placeholder="CODE" data-scanner-ignore onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applyCode(); } }} />
                <Button type="button" variant="outline" onClick={applyCode}>Apply</Button>
                {discount ? <Button type="button" variant="ghost" onClick={() => { setDiscount(null); setCodeInput(""); setCodeMessage(null); }}>Clear</Button> : null}
              </div>
              {codeMessage ? <FieldDescription className={discount ? "" : "text-destructive"}>{codeMessage}</FieldDescription> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="pointsInput">Redeem points</FieldLabel>
              <Input id="pointsInput" type="number" min={0} max={maxPoints} step={1} value={points} onChange={(e) => setPoints(Math.max(0, Math.floor(Number(e.target.value) || 0)))} disabled={!customer || maxPoints === 0} data-scanner-ignore />
              <FieldDescription>{customer ? `${customer.pointsBalance} available; redeem at least ${settings.loyalty.minRedeemPoints} (max ${maxPoints} on this order).` : "Select a customer to redeem points."}</FieldDescription>
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Totals</CardTitle></CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <Row label="Subtotal" value={cart.subtotalPaisa} />
            {cart.discountPaisa ? <Row label="Discount" value={-cart.discountPaisa} /> : null}
            {cart.pointsValuePaisa ? <Row label={`Points (${cart.pointsRedeemed})`} value={-cart.pointsValuePaisa} /> : null}
            {fulfillment === "delivery" ? <Row label="Delivery" value={cart.deliveryFeePaisa} /> : null}
            <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span className="tabular-nums" data-testid="order-total">{formatPKR(cart.totalPaisa)}</span></div>
            <div className="flex justify-between text-xs text-muted-foreground"><span>Includes tax</span><span className="tabular-nums">{formatPKR(cart.taxPaisa)}</span></div>
            {customer && cart.pointsEarned ? <div className="flex justify-between text-xs text-muted-foreground"><span>Points earned on completion</span><span>{cart.pointsEarned}</span></div> : null}
            {cart.issues.map((i) => <p key={i} className="text-xs text-destructive">{i}</p>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Deposit (optional)</CardTitle><CardDescription>Record money taken when the order is placed.</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="depositAmount">Amount (PKR)</FieldLabel><Input id="depositAmount" name="depositAmount" inputMode="decimal" placeholder="0.00" data-scanner-ignore /></Field>
              <Field>
                <FieldLabel htmlFor="depositMethod">Method</FieldLabel>
                <NativeSelect className="w-full" id="depositMethod" name="depositMethod" defaultValue=""><NativeSelectOption value="">—</NativeSelectOption><NativeSelectOption value="cash">Cash</NativeSelectOption><NativeSelectOption value="card">Card</NativeSelectOption><NativeSelectOption value="bank_transfer">Bank transfer</NativeSelectOption>{customer && customer.creditLimitPaisa > 0 ? <NativeSelectOption value="credit">Customer credit</NativeSelectOption> : null}</NativeSelect>
              </Field>
            </div>
            <Field><FieldLabel htmlFor="depositReference">Reference</FieldLabel><Input id="depositReference" name="depositReference" maxLength={100} data-scanner-ignore /></Field>
          </CardContent>
        </Card>
        {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending || lines.length === 0 || cart.issues.length > 0} className="flex-1">{pending ? "Saving…" : "Create order"}</Button>
          <Button type="button" variant="outline" nativeButton={false} render={<Link href="/orders" />}>Cancel</Button>
        </div>
      </div>
      <CameraScannerDialog open={scanOpen} onOpenChange={setScanOpen} onDetected={(code) => void scan(code)} closeOnDetect={false} />
    </form>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="tabular-nums">{formatPKR(value)}</span></div>;
}
