import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/db/schema";
import { ORDER_STATUS_LABELS } from "@/lib/orders/types";

const VARIANT: Record<OrderStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "default",
  confirmed: "default",
  ready: "default",
  out_for_delivery: "default",
  completed: "outline",
  cancelled: "secondary",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={VARIANT[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: "unpaid" | "partial" | "paid" | "refunded" }) {
  return <Badge variant={status === "paid" ? "outline" : status === "refunded" ? "secondary" : "destructive"}>{status}</Badge>;
}
