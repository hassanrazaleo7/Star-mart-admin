import { nextCounterValue } from "@/lib/documents";

/** EAN-13 check digit for the first 12 digits. */
export function ean13CheckDigit(body12: string): number {
  const digits = body12.split("").map(Number);
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** Generates the next in-store EAN-13 (prefix + sequence + check digit). */
export async function generateEan13(prefix: string): Promise<string> {
  const seq = await nextCounterValue("EAN");
  const width = 12 - prefix.length;
  const body = prefix + String(seq).padStart(width, "0").slice(-width);
  return body + ean13CheckDigit(body);
}

/** Which bwip-js symbology to render for a code. */
export function symbologyFor(code: string): "ean13" | "code128" {
  return isValidEan13(code) ? "ean13" : "code128";
}
