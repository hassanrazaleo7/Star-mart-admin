import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { isManager, ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { logoutAction } from "../../(admin)/actions";
import { checkDiscountCodeAction } from "../../(admin)/discounts/actions";
import { currentShiftFor } from "@/lib/shifts/queries";
import { closeShiftAction, createPosSaleAction, openShiftAction, shiftSummaryAction } from "./actions";
import { PosScreen } from "./pos-screen";

export const metadata: Metadata = { title: "Point of sale" };

export default async function PosPage() {
  const { user } = await requireRole(ROLE_GROUPS.staff);
  const [settings, shift] = await Promise.all([getSettings(), currentShiftFor(user.id)]);
  return (
    <PosScreen
      initialShift={shift ? { id: shift.id, number: shift.number, openedAt: shift.openedAt.toISOString(), openingFloatPaisa: shift.openingFloatPaisa, reopened: Boolean(shift.reopenedAt) } : null}
      openShift={openShiftAction}
      closeShift={closeShiftAction}
      loadShiftSummary={shiftSummaryAction}
      settings={{ loyalty: settings.loyalty, delivery: settings.delivery, storeName: settings.store.name, currencySymbol: settings.currency.symbol }}
      user={{ id: user.id, name: user.name, role: user.role }}
      canOverridePrices={isManager(user.role)}
      createSale={createPosSaleAction}
      checkDiscount={checkDiscountCodeAction}
      logout={logoutAction}
    />
  );
}
