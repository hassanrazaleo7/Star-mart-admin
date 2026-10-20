import type { Metadata } from "next";
import { asc, sql } from "drizzle-orm";
import { StatusToast } from "@/components/status-toast";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { adminSessions, adminUsers, suppliers } from "@/db/schema";
import { cleanupLoginAttempts } from "@/lib/auth/rate-limit";
import { requireRole } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/rbac";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { CreateUserForm } from "./create-user-form";
import { UserRowActions } from "./user-row-actions";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const ctx = await requireRole("super_admin");
  await cleanupLoginAttempts().catch(() => undefined);

  const [users, supplierRows] = await Promise.all([
    db
      .select({
        id: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        role: adminUsers.role,
        supplierId: adminUsers.supplierId,
        supplierName: suppliers.name,
        isActive: adminUsers.isActive,
        lockedUntil: adminUsers.lockedUntil,
        failedLoginCount: adminUsers.failedLoginCount,
        mustChangePassword: adminUsers.mustChangePassword,
        lastLoginAt: adminUsers.lastLoginAt,
        // Correlated subquery: the outer column must be table-qualified by hand.
        activeSessions: sql<number>`(select count(*)::int from ${adminSessions} s where s.user_id = ${adminUsers}.id and s.revoked_at is null and s.expires_at > now())`,
        isLocked: sql<boolean>`(${adminUsers.lockedUntil} is not null and ${adminUsers.lockedUntil} > now())`,
      })
      .from(adminUsers)
      .leftJoin(suppliers, sql`${suppliers.id} = ${adminUsers.supplierId}`)
      .orderBy(asc(adminUsers.createdAt)),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(sql`${suppliers.isActive}`).orderBy(asc(suppliers.name)),
  ]);

  return (
    <div className="grid gap-6">
      <StatusToast status={firstParam(params.status)} />
      <div>
        <h1 className="font-heading text-2xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">Staff accounts, cashiers and supplier portal logins.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create user</CardTitle>
            <CardDescription>A temporary password is generated and shown once; it must be changed at first sign-in.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateUserForm suppliers={supplierRows} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>All users</CardTitle>
            <CardDescription>{users.length} account{users.length === 1 ? "" : "s"}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const isSelf = user.id === ctx.user.id;
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {user.name}
                            {isSelf ? <span className="text-muted-foreground"> (you)</span> : null}
                          </span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={user.role === "super_admin" ? "default" : "secondary"}>{ROLE_LABELS[user.role]}</Badge>
                          {user.role === "vendor" ? <span className="text-xs text-muted-foreground">{user.supplierName ?? "No supplier"}</span> : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.isActive ? <Badge variant="outline">Active</Badge> : <Badge variant="destructive">Disabled</Badge>}
                          {user.isLocked ? <Badge variant="destructive">Locked until {formatDateTime(user.lockedUntil)}</Badge> : null}
                          {!user.isLocked && user.failedLoginCount > 0 ? <Badge variant="outline">{user.failedLoginCount} failed</Badge> : null}
                          {user.mustChangePassword ? <Badge variant="outline">Must change password</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell>{formatDateTime(user.lastLoginAt)}</TableCell>
                      <TableCell>{user.activeSessions}</TableCell>
                      <TableCell className="text-right">
                        <UserRowActions
                          user={{
                            id: user.id,
                            email: user.email,
                            name: user.name,
                            role: user.role,
                            supplierId: user.supplierId,
                            isActive: user.isActive,
                            isLocked: user.isLocked,
                            activeSessions: user.activeSessions,
                          }}
                          isSelf={isSelf}
                          suppliers={supplierRows}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
