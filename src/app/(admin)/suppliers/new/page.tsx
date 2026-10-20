import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { ROLE_GROUPS } from "@/lib/rbac";
import { SupplierForm } from "../supplier-form";

export const metadata: Metadata = { title: "New supplier" };

export default async function NewSupplierPage() {
  await requireRole(ROLE_GROUPS.managers);
  return (
    <div className="grid gap-6">
      <h1 className="font-heading text-2xl font-semibold">New supplier</h1>
      <SupplierForm />
    </div>
  );
}
