import { ExpiryAlertsDialog } from "@/components/expiry-alerts-dialog";
import { EXPIRY_ALERT_DAYS, EXPIRY_ALERT_LIMIT, listUpcomingExpiries } from "@/lib/products/queries";

export async function ExpiryAlerts() {
  const expiring = await listUpcomingExpiries();
  return <ExpiryAlertsDialog items={expiring} days={EXPIRY_ALERT_DAYS} limit={EXPIRY_ALERT_LIMIT} />;
}
