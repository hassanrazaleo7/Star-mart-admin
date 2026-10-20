"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { describeUserAgent, formatDateTime } from "@/lib/format";
import { revokeOtherSessionsAction, revokeSessionAction } from "./actions";

export type SessionRow = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  ip: string | null;
  userAgent: string | null;
  isCurrent: boolean;
};

export function SessionsTable({ sessions }: { sessions: SessionRow[] }) {
  const others = sessions.filter((s) => !s.isCurrent).length;

  return (
    <div className="grid gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Device</TableHead>
            <TableHead>IP</TableHead>
            <TableHead>Signed in</TableHead>
            <TableHead>Last active</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((session) => (
            <TableRow key={session.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span>{describeUserAgent(session.userAgent)}</span>
                  {session.isCurrent ? <Badge variant="secondary">This device</Badge> : null}
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">{session.ip ?? "—"}</TableCell>
              <TableCell>{formatDateTime(session.createdAt)}</TableCell>
              <TableCell>{formatDateTime(session.lastSeenAt)}</TableCell>
              <TableCell className="text-right">
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
                    {session.isCurrent ? "Sign out" : "Revoke"}
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {session.isCurrent ? "Sign out of this device?" : "Revoke this session?"}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {session.isCurrent
                          ? "You will be returned to the sign-in page."
                          : "That device will be signed out on its next request."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <form action={revokeSessionAction}>
                        <input type="hidden" name="sessionId" value={session.id} />
                        <AlertDialogAction type="submit" variant="destructive">
                          {session.isCurrent ? "Sign out" : "Revoke"}
                        </AlertDialogAction>
                      </form>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="outline" disabled={others === 0} />}>
            Sign out all other devices
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign out all other devices?</AlertDialogTitle>
              <AlertDialogDescription>
                {others} other session{others === 1 ? "" : "s"} will be revoked. This device stays signed in.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <form action={revokeOtherSessionsAction}>
                <AlertDialogAction type="submit" variant="destructive">
                  Sign out others
                </AlertDialogAction>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
