import type { OrderStatus, PaymentMethod } from "@/db/schema";

/** A line in the editor / POS cart before pricing. Prices are tax-inclusive paisa. */
export type CartLine = {
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  allowFractional: boolean;
  qty: number;
  unitPricePaisa: number;
  /** Shelf price at the time the line was added; kept so overrides can be shown. */
  listPricePaisa: number;
  costPaisa: number;
  taxRateBps: number;
  /** Manual per-line discount in paisa (managers only). */
  lineDiscountPaisa: number;
  stockQty: number;
};

export type PaymentInput = {
  method: PaymentMethod;
  /** Amount tendered; cash above the balance due becomes change. */
  amountPaisa: number;
  reference?: string | null;
  note?: string | null;
};

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["ready", "out_for_delivery", "completed", "cancelled"],
  ready: ["completed", "out_for_delivery", "cancelled"],
  out_for_delivery: ["completed", "cancelled"],
  completed: ["cancelled"],
  cancelled: [],
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  credit: "Customer credit",
};
