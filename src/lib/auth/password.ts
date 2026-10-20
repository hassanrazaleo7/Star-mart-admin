import { randomBytes } from "node:crypto";
import { hash, verify, type Options } from "@node-rs/argon2";
import { TEMP_PASSWORD_LENGTH } from "./constants";

// OWASP recommended Argon2id parameters (19 MiB, 2 iterations, 1 lane).
// The library defaults to Argon2id; hashPassword() verifies the PHC prefix anyway.
const ARGON2_OPTIONS: Options = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export async function hashPassword(password: string): Promise<string> {
  const phc = await hash(password, ARGON2_OPTIONS);
  if (!phc.startsWith("$argon2id$")) {
    throw new Error("Password hashing produced an unexpected algorithm");
  }
  return phc;
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Verifying against this hash costs the same as a real verification, so a login
// attempt for an unknown email takes as long as one for a known email.
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
  return dummyHash;
}

export async function burnPasswordVerification(password: string): Promise<void> {
  await verifyPassword(await getDummyHash(), password);
}

// Unambiguous alphabet (no 0/O, 1/l/I); rejection sampling keeps it unbiased.
const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export function generateTempPassword(length = TEMP_PASSWORD_LENGTH): string {
  const limit = 256 - (256 % TEMP_ALPHABET.length);
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte < limit) out += TEMP_ALPHABET[byte % TEMP_ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}
