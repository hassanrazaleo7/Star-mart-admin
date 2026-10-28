import { sql } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/db";
import { storeSettings } from "@/db/schema";

// One store_settings row per group; values are validated with zod and merged
// over defaults, so a missing or partial row is always safe to read.

export const settingsSchemas = {
  store: z.object({
    name: z.string().trim().min(1).max(100).default("Star Mart"),
    address: z.string().trim().max(300).default(""),
    phone: z.string().trim().max(40).default(""),
    email: z.string().trim().max(254).default(""),
    taxId: z.string().trim().max(60).default(""),
    timezone: z.string().trim().min(1).max(64).default("Asia/Karachi"),
  }),
  currency: z.object({
    code: z.string().trim().length(3).toUpperCase().default("PKR"),
    symbol: z.string().trim().min(1).max(8).default("Rs"),
    locale: z.string().trim().min(2).max(16).default("en-PK"),
  }),
  loyalty: z.object({
    enabled: z.boolean().default(true),
    earnPerPaisa: z.number().int().min(100).max(100_000_000).default(10_000), // 1 point per 100 PKR
    redeemValuePaisa: z.number().int().min(1).max(1_000_000).default(100), // 1 point = 1 PKR
    minRedeemPoints: z.number().int().min(0).max(1_000_000).default(100),
  }),
  stock: z.object({
    defaultReorderLevel: z.number().min(0).max(1_000_000).default(5),
    allowNegativeStock: z.boolean().default(false),
    lowStockEmails: z.boolean().default(true),
  }),
  delivery: z.object({
    feePaisa: z.number().int().min(0).max(100_000_000).default(0),
    freeAbovePaisa: z.number().int().min(0).max(100_000_000_000).nullable().default(null),
  }),
  invoice: z.object({
    dueDays: z.number().int().min(0).max(365).default(7),
    terms: z.string().trim().max(1000).default(""),
  }),
  receipt: z.object({
    header: z.string().trim().max(500).default(""),
    footer: z.string().trim().max(500).default("Thank you for shopping with us"),
  }),
  numbering: z.object({
    order: z.string().trim().min(1).max(8).toUpperCase().default("ORD"),
    invoice: z.string().trim().min(1).max(8).toUpperCase().default("INV"),
    purchase: z.string().trim().min(1).max(8).toUpperCase().default("PO"),
    submission: z.string().trim().min(1).max(8).toUpperCase().default("SUP"),
  }),
  barcode: z.object({
    prefix: z.string().trim().regex(/^\d{2,4}$/, "2 to 4 digits").default("200"),
  }),
  tax: z.object({
    defaultRateBps: z.number().int().min(0).max(10000).default(0),
  }),
} as const;

export type SettingsGroup = keyof typeof settingsSchemas;
export const SETTINGS_GROUPS = Object.keys(settingsSchemas) as SettingsGroup[];
export type Settings = { [G in SettingsGroup]: z.infer<(typeof settingsSchemas)[G]> };

function parseGroup<G extends SettingsGroup>(group: G, value: unknown): Settings[G] {
  const schema = settingsSchemas[group];
  const parsed = schema.safeParse(value && typeof value === "object" ? value : {});
  return (parsed.success ? parsed.data : schema.parse({})) as Settings[G];
}

export const DEFAULT_SETTINGS: Settings = Object.fromEntries(
  SETTINGS_GROUPS.map((g) => [g, parseGroup(g, {})]),
) as Settings;

/** All settings, merged over defaults. Cached per request in React Server Components. */
export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await db.select().from(storeSettings);
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(SETTINGS_GROUPS.map((g) => [g, parseGroup(g, byKey.get(g))])) as Settings;
});

export async function getSetting<G extends SettingsGroup>(group: G): Promise<Settings[G]> {
  return (await getSettings())[group];
}

export async function setSetting<G extends SettingsGroup>(group: G, value: Settings[G]): Promise<void> {
  const parsed = settingsSchemas[group].parse(value);
  await db
    .insert(storeSettings)
    .values({ key: group, value: parsed as Record<string, unknown> })
    .onConflictDoUpdate({ target: storeSettings.key, set: { value: parsed as Record<string, unknown>, updatedAt: sql`now()` } });
}
