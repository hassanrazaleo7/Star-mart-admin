"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

const MESSAGES: Record<string, { kind: "success" | "info" | "error"; text: string }> = {
  session_revoked: { kind: "success", text: "Session revoked." },
  others_revoked: { kind: "success", text: "All other sessions were signed out." },
  user_disabled: { kind: "success", text: "User disabled and signed out everywhere." },
  user_enabled: { kind: "success", text: "User enabled." },
  user_unlocked: { kind: "success", text: "Account unlocked." },
  user_sessions_revoked: { kind: "success", text: "All sessions for that user were revoked." },
  role_changed: { kind: "success", text: "Role updated; the user was signed out everywhere." },
  settings_saved: { kind: "success", text: "Settings saved." },
  product_created: { kind: "success", text: "Product created." },
  product_updated: { kind: "success", text: "Product saved." },
  product_archived: { kind: "success", text: "Product archived." },
  product_restored: { kind: "success", text: "Product restored." },
  product_deleted: { kind: "success", text: "Product deleted." },
  product_archived_instead: { kind: "info", text: "The product is referenced by other records, so it was archived instead of deleted." },
  category_saved: { kind: "success", text: "Category saved." },
  supplier_saved: { kind: "success", text: "Supplier saved." },
  supplier_enabled: { kind: "success", text: "Supplier activated." },
  supplier_disabled: { kind: "success", text: "Supplier deactivated." },
  purchase_created: { kind: "success", text: "Purchase saved as draft." },
  purchase_received: { kind: "success", text: "Purchase received; stock updated." },
  purchase_cancelled: { kind: "success", text: "Purchase cancelled." },
  purchase_not_draft: { kind: "error", text: "Only draft purchases can be received or cancelled." },
  stock_adjusted: { kind: "success", text: "Stock adjusted." },
  stock_take_done: { kind: "success", text: "Stock take committed." },
  batch_saved: { kind: "success", text: "Batch updated." },
  batches_written_off: { kind: "success", text: "Expired stock written off." },
  submission_created: { kind: "success", text: "Submitted to the store for approval." },
  submission_approved: { kind: "success", text: "Submission approved." },
  submission_rejected: { kind: "success", text: "Submission rejected." },
  profile_saved: { kind: "success", text: "Profile saved." },
  customer_enabled: { kind: "success", text: "Customer activated." },
  customer_disabled: { kind: "success", text: "Customer deactivated." },
  discount_enabled: { kind: "success", text: "Discount code enabled." },
  discount_disabled: { kind: "success", text: "Discount code disabled." },
  order_created: { kind: "success", text: "Order created." },
  order_confirmed: { kind: "success", text: "Order confirmed; stock reserved and invoice issued." },
  order_ready: { kind: "success", text: "Order marked ready." },
  order_out_for_delivery: { kind: "success", text: "Order is out for delivery." },
  order_completed: { kind: "success", text: "Order completed." },
  order_cancelled: { kind: "success", text: "Order cancelled." },
  payment_recorded: { kind: "success", text: "Payment recorded." },
  invoice_queued: { kind: "success", text: "Invoice email queued." },
  invoice_missing: { kind: "error", text: "This order has no invoice yet. Confirm it first." },
  invoice_no_email: { kind: "error", text: "No valid email address for this customer." },
  expense_created: { kind: "success", text: "Expense added." },
  expense_updated: { kind: "success", text: "Expense saved." },
  expense_deleted: { kind: "success", text: "Expense deleted." },
  expense_category_saved: { kind: "success", text: "Category saved." },
  report_exported: { kind: "success", text: "Export started." },
  emails_retried: { kind: "success", text: "Emails queued for another attempt." },
  outbox_ran: { kind: "success", text: "Queue processed." },
  outbox_empty: { kind: "info", text: "Nothing was due to send." },
  shift_opened: { kind: "success", text: "Shift opened." },
  shift_closed: { kind: "success", text: "Shift closed." },
  shift_reopened: { kind: "success", text: "Shift reopened; enter the corrected count to close it again." },
  forbidden_self: { kind: "error", text: "You cannot apply that action to your own account." },
  last_super_admin: { kind: "error", text: "There must always be at least one active super admin." },
  not_found: { kind: "error", text: "That record no longer exists." },
};

/** Turns a ?status=... query parameter into a toast and cleans the URL. */
export function StatusToast({ status }: { status?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!status) return;
    const message = MESSAGES[status];
    if (message) toast[message.kind](message.text, { id: `status-${status}` }); // stable id: no duplicates under Strict Mode re-runs
    router.replace(pathname);
  }, [status, pathname, router]);

  return null;
}
