"use client";

import { useActionState, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ADMIN_ROLES, type AdminRole } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/rbac";
import { createUserAction, type CreateUserState } from "./actions";

export type SupplierOption = { id: string; name: string };

const ROLE_HELP: Record<AdminRole, string> = {
  super_admin: "Full access, including users, settings and the audit log.",
  admin: "All store operations except user management.",
  cashier: "Point of sale, orders and customers only.",
  vendor: "Supplier portal: own products, submissions and statement.",
};

export function CreateUserForm({ suppliers }: { suppliers: SupplierOption[] }) {
  const [state, formAction, pending] = useActionState<CreateUserState, FormData>(createUserAction, { error: null });
  const [role, setRole] = useState<AdminRole>("admin");

  return (
    <div className="grid gap-4">
      {state.created ? (
        <Alert>
          <AlertTitle>User created: {state.created.email}</AlertTitle>
          <AlertDescription className="grid gap-2">
            <p>Share this temporary password securely. It is shown only once and must be changed at first sign-in.</p>
            <div className="flex items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 font-mono text-sm text-foreground">{state.created.tempPassword}</code>
              <CopyButton value={state.created.tempPassword} />
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      <form action={formAction} noValidate>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="new-user-email">Email</FieldLabel>
            <Input id="new-user-email" name="email" type="email" autoComplete="off" required maxLength={254} />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-user-name">Name</FieldLabel>
            <Input id="new-user-name" name="name" autoComplete="off" required maxLength={100} />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-user-role">Role</FieldLabel>
            <NativeSelect className="w-full" id="new-user-role" name="role" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
              {ADMIN_ROLES.map((r) => (
                <NativeSelectOption key={r} value={r}>
                  {ROLE_LABELS[r]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldDescription>{ROLE_HELP[role]}</FieldDescription>
          </Field>
          {role === "vendor" ? (
            <Field>
              <FieldLabel htmlFor="new-user-supplier">Supplier</FieldLabel>
              <NativeSelect className="w-full" id="new-user-supplier" name="supplierId" defaultValue="" required>
                <NativeSelectOption value="">Select a supplier…</NativeSelectOption>
                {suppliers.map((s) => (
                  <NativeSelectOption key={s.id} value={s.id}>
                    {s.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {suppliers.length === 0 ? <FieldDescription>No suppliers yet. Create one under Supply → Suppliers first.</FieldDescription> : null}
            </Field>
          ) : null}
          {state.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create user"}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
