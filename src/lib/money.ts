import { z } from "zod";

// Money is stored as integer paisa (1/100 PKR). Shelf prices are tax-inclusive.

export const PAISA_PER_RUPEE = 100;
const MAX_PAISA = 999_999_999_999; // ~10 billion PKR

/** "1,234.50" → 123450. Throws on malformed input or more than 2 decimals. */
export function parseMoneyInput(input: string): number {
  const cleaned = input.replace(/[,\s]/g, "").replace(/^rs\.?/i, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) throw new Error("Invalid amount");
  const negative = cleaned.startsWith("-");
  const [whole, frac = ""] = cleaned.replace("-", "").split(".");
  const paisa = Number(whole) * PAISA_PER_RUPEE + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(paisa) || paisa > MAX_PAISA) throw new Error("Amount too large");
  return negative ? -paisa : paisa;
}

export const moneyInputSchema = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .transform((value, ctx) => {
    try {
      return parseMoneyInput(value);
    } catch (error) {
      ctx.addIssue({ code: "custom", message: (error as Error).message });
      return z.NEVER;
    }
  });

export const nonNegativeMoneySchema = moneyInputSchema.refine((p) => p >= 0, "Amount cannot be negative");
export const positiveMoneySchema = moneyInputSchema.refine((p) => p > 0, "Amount must be greater than zero");
export const paisaSchema = z.coerce.number().int().min(0).max(MAX_PAISA);
export const bpsSchema = z.coerce.number().int().min(0).max(10000);

/** Basis points helpers for tax rates (1250 bps = 12.5 %). */
export const bpsToPercent = (bps: number) => bps / 100;
export const percentToBps = (percent: number) => Math.round(percent * 100);

/** Inclusive tax portion of a tax-inclusive amount. */
export function taxPortion(paisa: number, bps: number): number {
  if (bps <= 0 || paisa === 0) return 0;
  const net = Math.round((paisa * 10000) / (10000 + bps));
  return paisa - net;
}

export function splitTax(paisa: number, bps: number): { netPaisa: number; taxPaisa: number } {
  const taxPaisa = taxPortion(paisa, bps);
  return { netPaisa: paisa - taxPaisa, taxPaisa };
}

/** unit price × quantity, rounded to whole paisa (quantity may be fractional). */
export function lineTotal(unitPaisa: number, qty: number): number {
  return Math.round(unitPaisa * Math.round(qty * 1000)) / 1000 === unitPaisa * qty
    ? Math.round(unitPaisa * qty)
    : Math.round((unitPaisa * Math.round(qty * 1000)) / 1000);
}

export const roundPaisa = (value: number) => Math.round(value);

const formatters = new Map<string, Intl.NumberFormat>();
function numberFormatter(locale: string, fractionDigits: number) {
  const key = `${locale}:${fractionDigits}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
    formatters.set(key, f);
  }
  return f;
}

export type MoneyFormatOptions = { symbol?: string | false; locale?: string; compact?: boolean };

/** 123450 → "Rs 1,234.50". `symbol: false` omits the prefix. */
export function formatPKR(paisa: number, options: MoneyFormatOptions = {}): string {
  const { symbol = "Rs", locale = "en-PK", compact = false } = options;
  const negative = paisa < 0;
  const abs = Math.abs(paisa);
  const rupees = abs / PAISA_PER_RUPEE;
  const digits = compact && abs % PAISA_PER_RUPEE === 0 ? 0 : 2;
  const body = numberFormatter(locale, digits).format(rupees);
  const prefix = symbol ? `${symbol} ` : "";
  return `${negative ? "-" : ""}${prefix}${body}`;
}

export const formatPaisa = formatPKR;

/** 123450 → "1234.50" for CSV exports and number inputs. */
export function paisaToDecimalString(paisa: number): string {
  return (paisa / PAISA_PER_RUPEE).toFixed(2);
}
