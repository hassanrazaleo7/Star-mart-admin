import type { Metadata } from "next";
import { StatusToast } from "@/components/status-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { listActiveSessions } from "@/lib/auth/sessions-store";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { ChangePasswordForm } from "./change-password-form";
import { SessionsTable } from "./sessions-table";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { user, sid } = await requireSession({ allowPasswordChangeRequired: true });
  const sessions = await listActiveSessions(user.id);
  const mustChange = user.mustChangePassword || firstParam(params.reason) === "must_change";

  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(params.status)} />
      <div>
        <h1 className="font-heading text-2xl font-semibold">Security</h1>
        <p className="text-sm text-muted-foreground">Manage your password and the devices signed in to your account.</p>
      </div>
      {mustChange ? (
        <Alert variant="destructive">
          <AlertTitle>Set a new password to continue</AlertTitle>
          <AlertDescription>
            Your password was issued by an administrator. Choose your own before using the rest of the panel.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>Use a long, unique password you do not use anywhere else.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active sessions</CardTitle>
            <CardDescription>Sessions end after 30 minutes idle or 12 hours after sign-in.</CardDescription>
          </CardHeader>
          <CardContent>
            <SessionsTable
              sessions={sessions.map((s) => ({
                id: s.id,
                createdAt: s.createdAt.toISOString(),
                lastSeenAt: s.lastSeenAt.toISOString(),
                ip: s.ip,
                userAgent: s.userAgent,
                isCurrent: s.id === sid,
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
