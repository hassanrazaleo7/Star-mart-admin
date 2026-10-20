"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/auth/audit";
import { getRequestMeta, requireRole } from "@/lib/auth/session";
import { parseMoneyInput } from "@/lib/money";
import { ROLE_GROUPS } from "@/lib/rbac";
import { SETTINGS_GROUPS, setSetting, settingsSchemas, type SettingsGroup } from "@/lib/settings";
import { SETTINGS_SECTIONS, type FieldSpec } from "@/lib/settings-fields";
import { firstIssue } from "@/lib/validation/common";

export type SettingsState = { error: string | null; savedAt?: number; group?: string };

function coerce(spec: FieldSpec, raw: FormDataEntryValue | null): unknown {
  const text = typeof raw === "string" ? raw.trim() : "";
  switch (spec.type) {
    case "boolean":
      return raw === "on" || raw === "true";
    case "number": {
      if (text === "") return spec.nullable ? null : undefined;
      const n = Number(text);
      if (!Number.isFinite(n)) throw new Error(`${spec.label} must be a number`);
      // Percent-style fields are stored as basis points.
      return spec.name === "defaultRateBps" ? Math.round(n * 100) : n;
    }
    case "money": {
      if (text === "") return spec.nullable ? null : undefined;
      try {
        return parseMoneyInput(text);
      } catch {
        throw new Error(`${spec.label} must be an amount like 150.00`);
      }
    }
    default:
      return text;
  }
}

export async function updateSettingsAction(_previous: SettingsState, formData: FormData): Promise<SettingsState> {
  const ctx = await requireRole(ROLE_GROUPS.managers);
  const groupRaw = String(formData.get("group") ?? "");
  const section = SETTINGS_SECTIONS.find((s) => s.group === groupRaw);
  if (!section || !SETTINGS_GROUPS.includes(groupRaw as SettingsGroup)) return { error: "Unknown settings group" };
  const group = section.group;

  const values: Record<string, unknown> = {};
  try {
    for (const spec of section.fields) {
      const value = coerce(spec, formData.get(spec.name));
      if (value !== undefined) values[spec.name] = value;
    }
  } catch (error) {
    return { error: (error as Error).message, group };
  }

  const parsed = settingsSchemas[group].safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error), group };

  await setSetting(group, parsed.data as never);
  const meta = await getRequestMeta();
  await audit("settings.updated", { ...meta, actorUserId: ctx.user.id, metadata: { group } });
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { error: null, savedAt: Date.now(), group };
}
