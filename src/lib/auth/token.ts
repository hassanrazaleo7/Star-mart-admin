import type { JWT } from "next-auth/jwt";

export const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * A token minted by our Credentials flow always carries sid/sv/absExp. Anything
 * else (or anything past its absolute expiry) is treated as not logged in.
 * This runs in the proxy too, so it must stay free of database access.
 */
export function isTokenWithinAbsoluteLifetime(token: JWT): boolean {
  return (
    typeof token.sid === "string" &&
    typeof token.sv === "number" &&
    typeof token.absExp === "number" &&
    token.absExp > nowSeconds()
  );
}
