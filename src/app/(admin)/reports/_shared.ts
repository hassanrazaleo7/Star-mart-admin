import { requireRole } from "@/lib/auth/session";
import { ROLE_GROUPS } from "@/lib/rbac";
import { parseRange } from "@/lib/reports/range";
import { getSettings } from "@/lib/settings";
import { firstParam, type SearchParams } from "@/lib/search-params";

/** Manager check plus the resolved date range and timezone for every report page. */
export async function reportContext(searchParams: Promise<SearchParams>) {
  await requireRole(ROLE_GROUPS.managers);
  const [raw, settings] = await Promise.all([searchParams, getSettings()]);
  const tz = settings.store.timezone;
  const range = parseRange({ range: firstParam(raw.range), from: firstParam(raw.from), to: firstParam(raw.to) }, tz);
  return { range, tz, settings, raw };
}
