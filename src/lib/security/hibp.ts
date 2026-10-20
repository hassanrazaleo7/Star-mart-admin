import { createHash } from "node:crypto";

/**
 * Have I Been Pwned range check (k-anonymity: only the first 5 hex chars of the
 * SHA-1 leave the server). Returns null when the service could not be reached.
 */
export async function isPasswordPwned(password: string): Promise<boolean | null> {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "star-mart-admin-password-check" },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = await response.text();
    for (const line of body.split("\n")) {
      const [hashSuffix, count] = line.trim().split(":");
      if (hashSuffix === suffix) return Number(count) > 0;
    }
    return false;
  } catch (error) {
    console.warn("[hibp] lookup failed; skipping breach check", error);
    return null;
  }
}
