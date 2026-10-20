import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/env";
import { requireRole } from "@/lib/auth/session";
import { ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { SETTINGS_SECTIONS } from "@/lib/settings-fields";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user } = await requireRole(ROLE_GROUPS.managers);
  const settings = await getSettings();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Store identity, loyalty rules, stock, delivery, receipts and integrations.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>Configured through environment variables (see .env.example).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span>Product images (Vercel Blob)</span>
            {env.blobConfigured ? <Badge>Configured</Badge> : <Badge variant="outline">Not configured</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <span>Email (Brevo)</span>
            {env.emailConfigured ? <Badge>Configured</Badge> : env.BREVO_DRY_RUN ? <Badge variant="secondary">Dry run</Badge> : <Badge variant="outline">Not configured</Badge>}
          </div>
          {user.role === "super_admin" ? (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/settings/email" />}>
              Email outbox
            </Button>
          ) : null}
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/settings/security" />}>
            My security
          </Button>
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        {SETTINGS_SECTIONS.map((section) => (
          <SettingsForm key={section.group} section={section} values={settings[section.group] as Record<string, unknown>} />
        ))}
      </div>
    </div>
  );
}
