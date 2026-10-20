"use client";

import { usePathname } from "next/navigation";
import { titleForPath } from "@/lib/rbac";

export function HeaderTitle({ fallback = "Dashboard" }: { fallback?: string }) {
  const pathname = usePathname();
  return <h2 className="font-heading text-sm font-medium">{titleForPath(pathname) || fallback}</h2>;
}
