import type { AdminRole } from "@/db/schema";

// Dependency-free role helpers (safe to import from the proxy and client components).

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  cashier: "Cashier",
  vendor: "Supplier",
};

export const ROLE_GROUPS = {
  managers: ["super_admin", "admin"],
  staff: ["super_admin", "admin", "cashier"],
  vendor: ["vendor"],
} as const satisfies Record<string, readonly AdminRole[]>;

export const isManager = (role: AdminRole) => (ROLE_GROUPS.managers as readonly AdminRole[]).includes(role);
export const isStaff = (role: AdminRole) => (ROLE_GROUPS.staff as readonly AdminRole[]).includes(role);

/** Landing page after login. */
export function homeFor(role: AdminRole | undefined | null): string {
  return role === "vendor" ? "/vendor" : "/dashboard";
}

/** Paths a supplier (vendor) account may reach; everything else bounces to the portal. */
export function isVendorPath(pathname: string): boolean {
  return (
    pathname === "/vendor" ||
    pathname.startsWith("/vendor/") ||
    pathname.startsWith("/api/blob") ||
    pathname.startsWith("/api/barcode") ||
    pathname.startsWith("/api/session")
  );
}

/**
 * Where a freshly signed-in user should land: the requested callback when the
 * role may open it, otherwise the role's home. Deciding this server-side keeps
 * the proxy from having to redirect a client-side navigation (whose redirect
 * the router would follow without updating the address bar).
 */
export function landingFor(role: AdminRole, callbackUrl: string): string {
  const pathname = callbackUrl.split("?")[0] ?? callbackUrl;
  if (role === "vendor") return isVendorPath(pathname) && !pathname.startsWith("/api/") ? callbackUrl : "/vendor";
  return pathname === "/vendor" || pathname.startsWith("/vendor/") ? "/dashboard" : callbackUrl;
}

export type NavIcon =
  | "dashboard"
  | "pos"
  | "orders"
  | "customers"
  | "discounts"
  | "products"
  | "categories"
  | "barcodes"
  | "shifts"
  | "stock"
  | "suppliers"
  | "purchases"
  | "approvals"
  | "reports"
  | "expenses"
  | "settings"
  | "users"
  | "audit"
  | "submissions"
  | "statement"
  | "profile"
  | "security";

export type NavItem = { href: string; label: string; icon: NavIcon; badge?: "approvals" };
export type NavGroup = { label: string; items: NavItem[] };

const SELL: NavGroup = {
  label: "Sell",
  items: [
    { href: "/pos", label: "Point of sale", icon: "pos" },
    { href: "/orders", label: "Orders", icon: "orders" },
    { href: "/shifts", label: "Shifts", icon: "shifts" },
    { href: "/customers", label: "Customers", icon: "customers" },
    { href: "/discounts", label: "Discount codes", icon: "discounts" },
  ],
};
const CATALOGUE: NavGroup = {
  label: "Catalogue",
  items: [
    { href: "/products", label: "Products", icon: "products" },
    { href: "/products/categories", label: "Categories", icon: "categories" },
    { href: "/products/barcodes", label: "Barcodes", icon: "barcodes" },
    { href: "/stock", label: "Stock", icon: "stock" },
  ],
};
const SUPPLY: NavGroup = {
  label: "Supply",
  items: [
    { href: "/suppliers", label: "Suppliers", icon: "suppliers" },
    { href: "/purchases", label: "Purchases", icon: "purchases" },
    { href: "/approvals", label: "Approvals", icon: "approvals", badge: "approvals" },
  ],
};
const FINANCE: NavGroup = {
  label: "Finance",
  items: [
    { href: "/reports", label: "Reports", icon: "reports" },
    { href: "/expenses", label: "Expenses", icon: "expenses" },
  ],
};
const SYSTEM_ADMIN: NavGroup = { label: "System", items: [{ href: "/settings", label: "Settings", icon: "settings" }] };
const SYSTEM_SUPER: NavGroup = {
  label: "System",
  items: [
    { href: "/settings", label: "Settings", icon: "settings" },
    { href: "/users", label: "Users", icon: "users" },
    { href: "/audit", label: "Audit log", icon: "audit" },
  ],
};

export const NAV: Record<AdminRole, NavGroup[]> = {
  super_admin: [SELL, CATALOGUE, SUPPLY, FINANCE, SYSTEM_SUPER],
  admin: [SELL, CATALOGUE, SUPPLY, FINANCE, SYSTEM_ADMIN],
  cashier: [
    { label: "Sell", items: SELL.items.filter((i) => i.href !== "/discounts") },
    { label: "Catalogue", items: [{ href: "/products", label: "Products", icon: "products" }, { href: "/products/barcodes", label: "Barcodes", icon: "barcodes" }] },
  ],
  vendor: [
    {
      label: "Supplier portal",
      items: [
        { href: "/vendor", label: "Overview", icon: "dashboard" },
        { href: "/vendor/products", label: "My products", icon: "products" },
        { href: "/vendor/submissions", label: "Submissions", icon: "submissions" },
        { href: "/vendor/statement", label: "Statement", icon: "statement" },
        { href: "/vendor/profile", label: "Profile", icon: "profile" },
        { href: "/vendor/security", label: "Security", icon: "security" },
      ],
    },
  ],
};

/** Human page titles for the breadcrumb header. */
export function titleForPath(pathname: string): string {
  const all = Object.values(NAV).flatMap((groups) => groups.flatMap((g) => g.items));
  const exact = all.find((i) => i.href === pathname);
  if (exact) return exact.label;
  const prefix = all
    .filter((i) => pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return prefix?.label ?? "Dashboard";
}
