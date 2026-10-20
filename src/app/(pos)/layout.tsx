import { requireRole } from "@/lib/auth/session";
import { ROLE_GROUPS } from "@/lib/rbac";

// Full-screen till: no sidebar, no page padding. Pages and actions re-check the session themselves.
export default async function PosLayout({ children }: { children: React.ReactNode }) {
  await requireRole(ROLE_GROUPS.staff);
  return <div className="flex h-dvh flex-col overflow-hidden bg-background">{children}</div>;
}
