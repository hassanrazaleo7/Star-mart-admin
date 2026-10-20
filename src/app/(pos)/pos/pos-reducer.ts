import type { CustomerLite } from "@/lib/customers/queries";
import type { DiscountRule } from "@/lib/discounts/rules";
import type { CartLine } from "@/lib/orders/types";
import type { ProductSearchRow } from "@/lib/products/queries";

/** Guest checkout details: kept on the sale only, never turned into a customer record. */
export type GuestDetails = { name: string; phone: string; email: string };

export type HeldSale = { id: string; heldAt: number; lines: CartLine[]; customer: CustomerLite | null; guest?: GuestDetails | null; discount: DiscountRule | null; points: number; notes: string };

export type PosState = {
  lines: CartLine[];
  activeId: string | null;
  customer: CustomerLite | null;
  guest: GuestDetails | null;
  discount: DiscountRule | null;
  discountNote: string | null;
  points: number;
  notes: string;
  held: HeldSale[];
};

export type PosAction =
  | { type: "add"; product: ProductSearchRow; qty?: number }
  | { type: "setQty"; id: string; qty: number }
  | { type: "step"; id: string; delta: number }
  | { type: "remove"; id: string }
  | { type: "setPrice"; id: string; unitPricePaisa: number }
  | { type: "setLineDiscount"; id: string; paisa: number }
  | { type: "setActive"; id: string | null }
  | { type: "setCustomer"; customer: CustomerLite | null }
  | { type: "setGuest"; guest: Partial<GuestDetails> | null }
  | { type: "setDiscount"; discount: DiscountRule | null; note: string | null }
  | { type: "setPoints"; points: number }
  | { type: "setNotes"; notes: string }
  | { type: "clear" }
  | { type: "hold" }
  | { type: "resume"; id: string }
  | { type: "dropHeld"; id: string }
  | { type: "loadHeld"; held: HeldSale[] };

export const initialPosState: PosState = { lines: [], activeId: null, customer: null, guest: null, discount: null, discountNote: null, points: 0, notes: "", held: [] };

const emptyCart = (s: PosState): PosState => ({ ...s, lines: [], activeId: null, customer: null, guest: null, discount: null, discountNote: null, points: 0, notes: "" });

export function toCartLine(p: ProductSearchRow, qty = 1): CartLine {
  return { productId: p.id, name: p.name, sku: p.sku, unit: p.unit, allowFractional: p.allowFractional, qty, unitPricePaisa: p.pricePaisa, listPricePaisa: p.pricePaisa, costPaisa: p.costPaisa, taxRateBps: p.taxRateBps, lineDiscountPaisa: 0, stockQty: p.stockQty };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function posReducer(state: PosState, action: PosAction): PosState {
  switch (action.type) {
    case "add": {
      const qty = action.qty ?? 1;
      const existing = state.lines.find((l) => l.productId === action.product.id);
      if (existing) return { ...state, activeId: existing.productId, lines: state.lines.map((l) => (l.productId === existing.productId ? { ...l, qty: round3(l.qty + qty) } : l)) };
      const line = toCartLine(action.product, qty);
      return { ...state, lines: [...state.lines, line], activeId: line.productId };
    }
    case "setQty":
      return { ...state, lines: state.lines.map((l) => (l.productId === action.id ? { ...l, qty: Math.max(0, round3(action.qty)) } : l)) };
    case "step": {
      const line = state.lines.find((l) => l.productId === action.id);
      if (!line) return state;
      const next = round3(line.qty + action.delta);
      if (next <= 0) return posReducer(state, { type: "remove", id: action.id });
      return { ...state, lines: state.lines.map((l) => (l.productId === action.id ? { ...l, qty: next } : l)) };
    }
    case "remove": {
      const lines = state.lines.filter((l) => l.productId !== action.id);
      const activeId = state.activeId === action.id ? (lines[lines.length - 1]?.productId ?? null) : state.activeId;
      return { ...state, lines, activeId };
    }
    case "setPrice":
      return { ...state, lines: state.lines.map((l) => (l.productId === action.id ? { ...l, unitPricePaisa: Math.max(0, Math.round(action.unitPricePaisa)) } : l)) };
    case "setLineDiscount":
      return { ...state, lines: state.lines.map((l) => (l.productId === action.id ? { ...l, lineDiscountPaisa: Math.max(0, Math.round(action.paisa)) } : l)) };
    case "setActive":
      return { ...state, activeId: action.id };
    case "setCustomer":
      return { ...state, customer: action.customer, guest: action.customer ? null : state.guest, points: 0 };
    case "setGuest":
      if (action.guest === null) return { ...state, guest: null };
      return { ...state, customer: null, points: 0, guest: { name: "", phone: "", email: "", ...(state.guest ?? {}), ...action.guest } };
    case "setDiscount":
      return { ...state, discount: action.discount, discountNote: action.note };
    case "setPoints":
      return { ...state, points: Math.max(0, Math.floor(action.points || 0)) };
    case "setNotes":
      return { ...state, notes: action.notes };
    case "clear":
      return emptyCart(state);
    case "hold": {
      if (state.lines.length === 0) return state;
      const held: HeldSale = { id: crypto.randomUUID(), heldAt: Date.now(), lines: state.lines, customer: state.customer, guest: state.guest, discount: state.discount, points: state.points, notes: state.notes };
      return { ...emptyCart(state), held: [held, ...state.held].slice(0, 20) };
    }
    case "resume": {
      const sale = state.held.find((h) => h.id === action.id);
      if (!sale) return state;
      const rest = state.held.filter((h) => h.id !== action.id);
      // Park the current cart first so nothing is lost.
      const parked = state.lines.length ? [{ id: crypto.randomUUID(), heldAt: Date.now(), lines: state.lines, customer: state.customer, guest: state.guest, discount: state.discount, points: state.points, notes: state.notes }] : [];
      return { ...state, lines: sale.lines, activeId: sale.lines[sale.lines.length - 1]?.productId ?? null, customer: sale.customer, guest: sale.guest ?? null, discount: sale.discount, discountNote: sale.discount ? `${sale.discount.code} applied` : null, points: sale.points, notes: sale.notes, held: [...parked, ...rest] };
    }
    case "dropHeld":
      return { ...state, held: state.held.filter((h) => h.id !== action.id) };
    case "loadHeld":
      return { ...state, held: action.held };
    default:
      return state;
  }
}
