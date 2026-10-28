import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";

export type AuditAction =
  | "login.success"
  | "login.failed"
  | "login.locked"
  | "login.rate_limited"
  | "logout"
  | "password.changed"
  | "password.reset_by_admin"
  | "session.revoked"
  | "sessions.revoked_all"
  | "user.created"
  | "user.disabled"
  | "user.enabled"
  | "user.role_changed"
  | "user.unlocked"
  | "settings.updated"
  | "product.created"
  | "product.updated"
  | "product.archived"
  | "product.restored"
  | "product.deleted"
  | "product.barcode_assigned"
  | "products.imported"
  | "products.exported"
  | "category.created"
  | "category.updated"
  | "supplier.created"
  | "supplier.updated"
  | "supplier.enabled"
  | "supplier.disabled"
  | "supplier_payment.recorded"
  | "purchase_return.recorded"
  | "purchase.created"
  | "purchase.received"
  | "purchase.cancelled"
  | "stock.adjusted"
  | "stock.take_committed"
  | "submission.created"
  | "submission.approved"
  | "submission.rejected"
  | "vendor.profile_updated"
  | "customer.created"
  | "customer.updated"
  | "customer.enabled"
  | "customer.disabled"
  | "loyalty.adjusted"
  | "credit.payment_recorded"
  | "discount.created"
  | "discount.updated"
  | "discount.enabled"
  | "discount.disabled"
  | "order.created"
  | "order.status_changed"
  | "order.cancelled"
  | "payment.recorded"
  | "invoice.emailed"
  | "expense.created"
  | "expense.updated"
  | "expense.deleted"
  | "expense_category.created"
  | "expense_category.updated"
  | "report.exported"
  | "email.test_sent"
  | "email.retried"
  | "shift.opened"
  | "shift.closed"
  | "shift.reopened";

export type AuditContext = {
  actorUserId?: string | null;
  targetUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Appends an audit row. Failures are logged, not thrown: an audit outage must
 * not take authentication down with it.
 */
export async function audit(action: AuditAction, ctx: AuditContext = {}): Promise<void> {
  try {
    await db.insert(adminAuditLogs).values({
      action,
      actorUserId: ctx.actorUserId ?? null,
      targetUserId: ctx.targetUserId ?? null,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      metadata: ctx.metadata ?? null,
    });
  } catch (error) {
    console.error(`[audit] failed to record ${action}`, error);
  }
}
