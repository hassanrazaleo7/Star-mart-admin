"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/reports/sales", "Sales"],
  ["/reports/purchases", "Purchases"],
  ["/reports/pnl", "Profit & loss"],
  ["/reports/expenses", "Expenses"],
  ["/reports/stock", "Stock"],
  ["/reports/loyalty", "Loyalty"],
  ["/reports/balances", "Balances"],
] as const;

export function ReportsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b" aria-label="Reports">
      {TABS.map(([href, label]) => (
        <Link key={href} href={href} className={`-mb-px border-b-2 px-3 py-2 text-sm ${pathname === href ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`} aria-current={pathname === href ? "page" : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
