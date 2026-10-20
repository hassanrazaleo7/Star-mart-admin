import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { StatusToast } from "@/components/status-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { emailOutbox } from "@/db/schema";
import { env } from "@/env";
import { requireRole } from "@/lib/auth/session";
import { formatLocalDateTime } from "@/lib/format";
import { ROLE_GROUPS } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { retryEmailsAction, runOutboxNowAction } from "./actions";
import { TestEmailForm } from "./test-email-form";

export const metadata: Metadata = { title: "Email" };

export default async function EmailSettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { user } = await requireRole(ROLE_GROUPS.managers);
  const raw = await searchParams;
  const settings = await getSettings();
  const rows = await db.select().from(emailOutbox).orderBy(desc(emailOutbox.createdAt)).limit(50);
  const failed = rows.filter((r) => r.status === "failed").length;
  const tz = settings.store.timezone;
  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(raw.status)} />
      <div>
        <h1 className="font-heading text-2xl font-semibold">Email</h1>
        <p className="text-sm text-muted-foreground">Order confirmations, invoices and low-stock alerts are queued here and sent through Brevo.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Brevo {env.emailConfigured ? <Badge>Configured</Badge> : env.BREVO_DRY_RUN ? <Badge variant="secondary">Dry run</Badge> : <Badge variant="outline">Not configured</Badge>}</CardTitle>
          <CardDescription>
            {env.emailConfigured ? `Sending as ${env.BREVO_SENDER_NAME ?? "Star Mart"} <${env.BREVO_SENDER_EMAIL}>.` : env.BREVO_DRY_RUN ? "BREVO_DRY_RUN=true: emails are rendered and logged, not delivered." : "Set BREVO_API_KEY and BREVO_SENDER_EMAIL in the environment to deliver mail. Until then queued emails fail with a clear reason."}
            {" "}Low-stock emails are {settings.stock.lowStockEmails ? "on" : "off"} (Settings → Stock). Cron: call <code className="rounded bg-muted px-1">/api/jobs/email</code> with the CRON_SECRET header {env.CRON_SECRET ? "(configured)" : "(CRON_SECRET not set)"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <TestEmailForm defaultEmail={user.email} />
          <div className="flex gap-2">
            <form action={runOutboxNowAction}><Button type="submit" variant="outline" size="sm">Process queue now</Button></form>
            {failed ? <form action={retryEmailsAction}><input type="hidden" name="scope" value="failed" /><Button type="submit" variant="outline" size="sm">Retry all failed ({failed})</Button></form> : null}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Outbox</CardTitle><CardDescription>Last 50 emails.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Queued</TableHead><TableHead>To</TableHead><TableHead>Subject</TableHead><TableHead>Template</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nothing queued yet.</TableCell></TableRow> : null}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{formatLocalDateTime(r.createdAt, tz)}</TableCell>
                  <TableCell>{r.toName ? <div>{r.toName}</div> : null}<div className="text-xs text-muted-foreground">{r.toEmail}</div></TableCell>
                  <TableCell>{r.subject}</TableCell>
                  <TableCell><Badge variant="outline">{r.template}</Badge></TableCell>
                  <TableCell><Badge variant={r.status === "sent" ? "outline" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge>{r.lastError ? <div className="max-w-xs truncate text-xs text-muted-foreground" title={r.lastError}>{r.lastError}</div> : null}{r.providerMessageId ? <div className="max-w-xs truncate font-mono text-xs text-muted-foreground">{r.providerMessageId}</div> : null}</TableCell>
                  <TableCell>{r.attempts}{r.status === "pending" && r.scheduledFor > new Date() ? <div className="text-xs text-muted-foreground">next {formatLocalDateTime(r.scheduledFor, tz)}</div> : null}</TableCell>
                  <TableCell>{r.status === "failed" ? <form action={retryEmailsAction}><input type="hidden" name="outboxId" value={r.id} /><Button type="submit" size="sm" variant="ghost">Retry</Button></form> : null}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
