"use client";

import { MoreHorizontalIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ADMIN_ROLES, type AdminRole } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/rbac";
import {
  resetUserPasswordAction,
  revokeUserSessionsAction,
  setUserActiveAction,
  setUserRoleAction,
  unlockUserAction,
  type ResetPasswordState,
  type SetRoleState,
} from "./actions";
import type { SupplierOption } from "./create-user-form";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  supplierId: string | null;
  isActive: boolean;
  isLocked: boolean;
  activeSessions: number;
};

type Dialog = "disable" | "enable" | "role" | "reset" | "unlock" | "revoke";

export function UserRowActions({ user, isSelf, suppliers }: { user: UserRow; isSelf: boolean; suppliers: SupplierOption[] }) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => setDialog(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Actions" />}>
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={isSelf} onClick={() => setDialog("reset")}>Reset password</DropdownMenuItem>
          <DropdownMenuItem disabled={!user.isLocked} onClick={() => setDialog("unlock")}>Unlock account</DropdownMenuItem>
          <DropdownMenuItem disabled={user.activeSessions === 0} onClick={() => setDialog("revoke")}>Revoke all sessions</DropdownMenuItem>
          <DropdownMenuItem disabled={isSelf} onClick={() => setDialog("role")}>Change role</DropdownMenuItem>
          <DropdownMenuSeparator />
          {user.isActive ? (
            <DropdownMenuItem variant="destructive" disabled={isSelf} onClick={() => setDialog("disable")}>Disable account</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setDialog("enable")}>Enable account</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog open={dialog === "disable"} onClose={close} title={`Disable ${user.email}?`} description="They are signed out everywhere immediately and cannot sign in until re-enabled." action={setUserActiveAction} fields={{ userId: user.id, active: "false" }} confirmLabel="Disable" destructive />
      <ConfirmDialog open={dialog === "enable"} onClose={close} title={`Enable ${user.email}?`} description="They will be able to sign in again with their existing password." action={setUserActiveAction} fields={{ userId: user.id, active: "true" }} confirmLabel="Enable" />
      <ConfirmDialog open={dialog === "unlock"} onClose={close} title={`Unlock ${user.email}?`} description="Clears the failed-login counter and the lock." action={unlockUserAction} fields={{ userId: user.id }} confirmLabel="Unlock" />
      <ConfirmDialog open={dialog === "revoke"} onClose={close} title={`Revoke all sessions of ${user.email}?`} description={`${user.activeSessions} active session${user.activeSessions === 1 ? "" : "s"} will be signed out.`} action={revokeUserSessionsAction} fields={{ userId: user.id }} confirmLabel="Revoke" destructive />
      <RoleDialog open={dialog === "role"} onClose={close} user={user} suppliers={suppliers} />
      <ResetPasswordDialog open={dialog === "reset"} onClose={close} user={user} />
    </>
  );
}

function ConfirmDialog(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  confirmLabel: string;
  destructive?: boolean;
}) {
  return (
    <AlertDialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form action={props.action}>
            {Object.entries(props.fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <AlertDialogAction type="submit" variant={props.destructive ? "destructive" : "default"}>
              {props.confirmLabel}
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RoleDialog({ open, onClose, user, suppliers }: { open: boolean; onClose: () => void; user: UserRow; suppliers: SupplierOption[] }) {
  const [state, formAction, pending] = useActionState<SetRoleState, FormData>(setUserRoleAction, { error: null });
  const [role, setRole] = useState<AdminRole>(user.role);

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <form action={formAction} className="contents">
          <AlertDialogHeader>
            <AlertDialogTitle>Change role of {user.email}</AlertDialogTitle>
            <AlertDialogDescription>The user is signed out everywhere so the new permissions apply immediately.</AlertDialogDescription>
          </AlertDialogHeader>
          <input type="hidden" name="userId" value={user.id} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`role-${user.id}`}>Role</FieldLabel>
              <NativeSelect className="w-full" id={`role-${user.id}`} name="role" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
                {ADMIN_ROLES.map((r) => (
                  <NativeSelectOption key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            {role === "vendor" ? (
              <Field>
                <FieldLabel htmlFor={`supplier-${user.id}`}>Supplier</FieldLabel>
                <NativeSelect className="w-full" id={`supplier-${user.id}`} name="supplierId" defaultValue={user.supplierId ?? ""} required>
                  <NativeSelectOption value="">Select a supplier…</NativeSelectOption>
                  {suppliers.map((s) => (
                    <NativeSelectOption key={s.id} value={s.id}>
                      {s.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
          </FieldGroup>
          {state.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ResetPasswordDialog({ open, onClose, user }: { open: boolean; onClose: () => void; user: UserRow }) {
  const [state, formAction, pending] = useActionState<ResetPasswordState, FormData>(resetUserPasswordAction, { error: null });

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset password for {user.email}?</AlertDialogTitle>
          <AlertDialogDescription>
            A new temporary password is generated and shown once. All of their sessions are revoked and they must set a new password at next sign-in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {state.tempPassword ? (
          <Alert>
            <AlertDescription className="grid gap-2">
              <p>Temporary password for {state.email}:</p>
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 font-mono text-sm text-foreground">{state.tempPassword}</code>
                <CopyButton value={state.tempPassword} />
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{state.tempPassword ? "Done" : "Cancel"}</AlertDialogCancel>
          {state.tempPassword ? null : (
            <form action={formAction}>
              <input type="hidden" name="userId" value={user.id} />
              <AlertDialogAction type="submit" variant="destructive" disabled={pending}>
                {pending ? "Resetting…" : "Reset password"}
              </AlertDialogAction>
            </form>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
