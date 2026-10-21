"use client";

import {
  BarChart3Icon,
  BoxesIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  PackageIcon,
  ReceiptTextIcon,
  ScrollTextIcon,
  SendIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  StoreIcon,
  TagsIcon,
  ScanBarcodeIcon,
  ClockIcon,
  TicketIcon,
  TruckIcon,
  UserCogIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import type { NavGroup, NavIcon } from "@/lib/rbac";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboardIcon,
  pos: ShoppingCartIcon,
  orders: ClipboardListIcon,
  customers: UsersIcon,
  discounts: TicketIcon,
  products: PackageIcon,
  categories: TagsIcon,
  barcodes: ScanBarcodeIcon,
  shifts: ClockIcon,
  stock: BoxesIcon,
  suppliers: TruckIcon,
  purchases: ReceiptTextIcon,
  approvals: ClipboardCheckIcon,
  reports: BarChart3Icon,
  expenses: WalletIcon,
  settings: SettingsIcon,
  users: UserCogIcon,
  audit: ScrollTextIcon,
  submissions: SendIcon,
  statement: FileTextIcon,
  profile: UserIcon,
  security: ShieldCheckIcon,
};

type Props = {
  groups: NavGroup[];
  title: string;
  subtitle?: string;
  home: string;
  pendingApprovals?: number;
  showBrandLogo?: boolean;
};

export function AppSidebar({ groups, title, subtitle, home, pendingApprovals = 0, showBrandLogo = false }: Props) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || (href !== home && pathname.startsWith(href + "/"));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className={showBrandLogo ? "h-auto min-h-12 group-data-[collapsible=icon]:size-8" : undefined}
              data-brand-logo={showBrandLogo ? "" : undefined}
              render={<Link href={home} />}
              tooltip={title}
            >
              {showBrandLogo ? (
                <span className="flex h-20 w-48 shrink-0 items-center justify-center rounded-lg bg-transparent p-1.5 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-1">
                  <Image src="/star-mart-logo.png" alt="Star Mart" width={746} height={301} priority className="h-full w-full object-contain" />
                </span>
              ) : (
                <>
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <StoreIcon className="size-4" />
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className="font-heading font-semibold">{title}</span>
                    {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
                  </span>
                </>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={pathname === home} render={<Link href={home} />} tooltip="Dashboard">
                  <LayoutDashboardIcon />
                  <span>Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items
                  .filter((item) => item.href !== home)
                  .map((item) => {
                    const Icon = ICONS[item.icon];
                    const badge = item.badge === "approvals" && pendingApprovals > 0 ? pendingApprovals : null;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton isActive={isActive(item.href)} render={<Link href={item.href} />} tooltip={item.label}>
                          <Icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                        {badge ? <SidebarMenuBadge className="bg-primary text-primary-foreground">{badge}</SidebarMenuBadge> : null}
                      </SidebarMenuItem>
                    );
                  })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
