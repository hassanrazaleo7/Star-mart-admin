import type { Metadata } from "next";
import { StatusToast } from "@/components/status-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireVendor } from "@/lib/auth/session";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { getSupplier } from "@/lib/suppliers/queries";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

export default async function VendorProfilePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  const ctx = await requireVendor();
  const supplier = await getSupplier(ctx.supplierId);
  if (!supplier) return null;
  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status)} />
      <div>
        <h1 className="font-heading text-2xl font-semibold">Profile</h1>
        <p className="text-sm text-muted-foreground">Contact details the store uses for orders and payments.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>{supplier.name}</CardTitle><CardDescription>Changes are visible to the store immediately.</CardDescription></CardHeader>
        <CardContent><ProfileForm supplier={supplier} /></CardContent>
      </Card>
    </div>
  );
}
