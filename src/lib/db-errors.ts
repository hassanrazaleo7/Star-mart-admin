/** Postgres error helpers. Drizzle wraps driver errors, so look at `cause` too. */

export function getPgErrorCode(error: unknown): string | undefined {
  const direct = (error as { code?: unknown })?.code;
  if (typeof direct === "string") return direct;
  const nested = (error as { cause?: { code?: unknown } })?.cause?.code;
  return typeof nested === "string" ? nested : undefined;
}

export function getPgConstraint(error: unknown): string | undefined {
  const direct = (error as { constraint?: unknown })?.constraint;
  if (typeof direct === "string") return direct;
  const nested = (error as { cause?: { constraint?: unknown } })?.cause?.constraint;
  return typeof nested === "string" ? nested : undefined;
}

export const isUniqueViolation = (error: unknown) => getPgErrorCode(error) === "23505";
export const isNotNullViolation = (error: unknown) => getPgErrorCode(error) === "23502";
export const isCheckViolation = (error: unknown) => getPgErrorCode(error) === "23514";
export const isForeignKeyViolation = (error: unknown) => getPgErrorCode(error) === "23503";

/** True when a guarded batch (see src/lib/db/guarded.ts) was rejected by one of its guards. */
export const isGuardFailure = (error: unknown) => isNotNullViolation(error) || isCheckViolation(error);
