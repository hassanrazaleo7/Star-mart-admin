"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { paisaToDecimalString } from "@/lib/money";
import type { SettingsSection } from "@/lib/settings-fields";
import { updateSettingsAction, type SettingsState } from "./actions";

type Props = { section: SettingsSection; values: Record<string, unknown> };

function initialValue(spec: SettingsSection["fields"][number], value: unknown): string {
  if (value == null) return "";
  if (spec.type === "money") return paisaToDecimalString(Number(value));
  if (spec.type === "number" && spec.name === "defaultRateBps") return String(Number(value) / 100);
  return String(value);
}

export function SettingsForm({ section, values }: Props) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(updateSettingsAction, { error: null });

  useEffect(() => {
    if (state.savedAt) toast.success(`${section.title} saved.`, { id: `settings-${section.group}` });
  }, [state.savedAt, section.title, section.group]);

  return (
    <Card>
      <form action={formAction} noValidate>
        <input type="hidden" name="group" value={section.group} />
        <CardHeader>
          <CardTitle>{section.title}</CardTitle>
          <CardDescription>{section.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {section.fields.map((spec) => {
              const id = `${section.group}-${spec.name}`;
              const current = values[spec.name];
              if (spec.type === "boolean") {
                return (
                  <Field key={spec.name} orientation="horizontal">
                    <Switch id={id} name={spec.name} defaultChecked={Boolean(current)} />
                    <div className="grid gap-0.5">
                      <FieldLabel htmlFor={id}>{spec.label}</FieldLabel>
                      {spec.help ? <FieldDescription>{spec.help}</FieldDescription> : null}
                    </div>
                  </Field>
                );
              }
              return (
                <Field key={spec.name}>
                  <FieldLabel htmlFor={id}>{spec.label}</FieldLabel>
                  {spec.type === "textarea" ? (
                    <Textarea id={id} name={spec.name} defaultValue={initialValue(spec, current)} rows={3} />
                  ) : spec.type === "select" ? (
                    <NativeSelect className="w-full" id={id} name={spec.name} defaultValue={initialValue(spec, current)}>
                      {spec.options?.map((o) => (
                        <NativeSelectOption key={o.value} value={o.value}>
                          {o.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Input
                      id={id}
                      name={spec.name}
                      defaultValue={initialValue(spec, current)}
                      inputMode={spec.type === "text" ? undefined : "decimal"}
                      type={spec.type === "number" ? "number" : "text"}
                      step={spec.type === "number" ? (spec.step ?? 1) : undefined}
                      className="max-w-sm"
                    />
                  )}
                  {spec.help ? <FieldDescription>{spec.help}</FieldDescription> : null}
                </Field>
              );
            })}
            {state.error && state.group === section.group ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
