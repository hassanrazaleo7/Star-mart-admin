"use server";

import { signOut } from "@/auth";
import { audit } from "@/lib/auth/audit";
import { getCurrentSession, getRequestMeta } from "@/lib/auth/session";
import { revokeSession } from "@/lib/auth/sessions-store";

export async function logoutAction(): Promise<void> {
  const ctx = await getCurrentSession();
  if (ctx) {
    const meta = await getRequestMeta();
    await revokeSession(ctx.sid, "logout", ctx.user.id);
    await audit("logout", { ...meta, actorUserId: ctx.user.id, metadata: { sid: ctx.sid } });
  }
  await signOut({ redirectTo: "/login?reason=logged_out" });
}
