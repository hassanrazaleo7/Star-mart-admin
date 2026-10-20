import { cookies } from "next/headers";
import { AppSidebar } from "@/components/app-sidebar";
import { HeaderTitle } from "@/components/header-title";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { logoutAction } from "@/app/(admin)/actions";
import { UserMenu } from "@/app/(admin)/user-menu";
import { requireVendor } from "@/lib/auth/session";
import { NAV } from "@/lib/rbac";

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireVendor({ allowPasswordChangeRequired: true });
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar groups={NAV.vendor} title={ctx.supplierName} subtitle="Supplier portal" home="/vendor" />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mx-1 h-5" />
          <HeaderTitle fallback="Overview" />
          <div className="ml-auto">
            <UserMenu name={ctx.user.name} email={ctx.user.email} role={ctx.user.role} logoutAction={logoutAction} securityHref="/vendor/security" />
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
