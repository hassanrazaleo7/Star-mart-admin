import { cookies } from "next/headers";
import { AppSidebar } from "@/components/app-sidebar";
import { HeaderTitle } from "@/components/header-title";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireRole } from "@/lib/auth/session";
import { isManager, NAV, ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { countPendingApprovals } from "@/lib/suppliers/queries";
import { logoutAction } from "./actions";
import { UserMenu } from "./user-menu";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // UI-only check (layouts do not re-run on client navigation); every page and
  // server action performs its own requireSession()/requireRole().
  const { user } = await requireRole(ROLE_GROUPS.staff, { allowPasswordChangeRequired: true });
  const [settings, cookieStore] = await Promise.all([getSettings(), cookies()]);
  const pendingApprovals = isManager(user.role) ? await countPendingApprovals() : 0;
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar groups={NAV[user.role]} title={settings.store.name} subtitle="Admin panel" home="/dashboard" pendingApprovals={pendingApprovals} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mx-1 h-5" />
          <HeaderTitle />
          <div className="ml-auto">
            <UserMenu name={user.name} email={user.email} role={user.role} logoutAction={logoutAction} />
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
