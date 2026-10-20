import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { adminAuditLogs, adminUsers } from "@/db/schema";
import { requireRole } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Audit log" };

const LIMIT = 200;

function badgeVariant(action: string): "default" | "secondary" | "destructive" | "outline" {
  if (action.startsWith("login.failed") || action.includes("locked") || action.includes("rate_limited")) return "destructive";
  if (action.startsWith("login.") || action === "logout") return "secondary";
  return "outline";
}

export default async function AuditPage() {
  await requireRole("super_admin");
  const actor = alias(adminUsers, "actor");
  const target = alias(adminUsers, "target");

  const rows = await db
    .select({
      id: adminAuditLogs.id,
      action: adminAuditLogs.action,
      ip: adminAuditLogs.ip,
      userAgent: adminAuditLogs.userAgent,
      metadata: adminAuditLogs.metadata,
      createdAt: adminAuditLogs.createdAt,
      actorEmail: actor.email,
      targetEmail: target.email,
    })
    .from(adminAuditLogs)
    .leftJoin(actor, eq(actor.id, adminAuditLogs.actorUserId))
    .leftJoin(target, eq(target.id, adminAuditLogs.targetUserId))
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(LIMIT);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">Most recent {LIMIT} security events.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>Logins, lockouts, password and session changes, and admin management.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">No events yet.</TableCell>
                </TableRow>
              ) : null}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant={badgeVariant(row.action)}>{row.action}</Badge>
                  </TableCell>
                  <TableCell>{row.actorEmail ?? "—"}</TableCell>
                  <TableCell>{row.targetEmail ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{row.ip ?? "—"}</TableCell>
                  <TableCell className="max-w-md truncate font-mono text-xs text-muted-foreground" title={row.metadata ? JSON.stringify(row.metadata) : undefined}>
                    {row.metadata ? JSON.stringify(row.metadata) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
