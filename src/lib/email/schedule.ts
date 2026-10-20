import "server-only";
import { after } from "next/server";
import { checkLowStock } from "./low-stock";
import { sendPending } from "./worker";

/**
 * Runs the email work after the response is sent: optional low-stock scan,
 * then a small batch of due emails. The cron job picks up anything left over.
 */
export function scheduleEmailWork(options: { lowStock?: boolean } = {}): void {
  after(async () => {
    try {
      if (options.lowStock) await checkLowStock();
      await sendPending({ limit: 5 });
    } catch (error) {
      console.error("[email] scheduled work failed", error);
    }
  });
}
