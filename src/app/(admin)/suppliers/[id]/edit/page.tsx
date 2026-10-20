import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { ROLE_GROUPS } from "@/lib/rbac";
import { getSupplier } from "@/lib/suppliers/queries";
import { SupplierForm } from "../../supplier-form";

export const metadata: Metadata = { title: "Edit supplier" };

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(ROLE_GROUPS.managers);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supplier = await getSupplier(id);
  if (!supplier) notFound();
  return (
    <div className="grid gap-6">
      <h1 className="font-heading text-2xl font-semibold">{supplier.name}</h1>
      <SupplierForm supplier={supplier} />
    </div>
  );
}
