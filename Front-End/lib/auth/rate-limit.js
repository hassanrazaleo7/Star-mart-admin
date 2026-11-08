import { createHash } from "node:crypto";
import { pool } from "../db.js";

let lastCleanupAt = 0;

function rateLimitKey(bucket, identifier) {
    const identifierHash = createHash("sha256")
        .update(String(identifier).trim().toLowerCase())
        .digest("hex");
    return `storefront:${bucket}:${identifierHash}`;
}

async function cleanupExpiredRateLimits() {
    if (Date.now() - lastCleanupAt < 60 * 60 * 1000) {
        return;
    }

    await pool.query(
        `DELETE FROM star_mart.admin_login_attempts
         WHERE key LIKE 'storefront:%'
           AND window_start < NOW() - INTERVAL '1 day'`,
    );
    lastCleanupAt = Date.now();
}

export function getClientIp(requestHeaders) {
    const forwarded = requestHeaders.get("x-forwarded-for")
        ?.split(",")[0]
        ?.trim();
    const realIp = requestHeaders.get("x-real-ip")?.trim();
    return forwarded || realIp || "unknown";
}

export async function consumeRateLimit(bucket, identifier, limit, windowSeconds) {
    await cleanupExpiredRateLimits();

    const key = rateLimitKey(bucket, identifier);
    const { rows } = await pool.query(
        `INSERT INTO star_mart.admin_login_attempts (key, count, window_start)
         VALUES ($1, 1, NOW())
         ON CONFLICT (key) DO UPDATE SET
           count = CASE
             WHEN star_mart.admin_login_attempts.window_start
               < NOW() - ($2::integer * INTERVAL '1 second')
             THEN 1
             ELSE star_mart.admin_login_attempts.count + 1
           END,
           window_start = CASE
             WHEN star_mart.admin_login_attempts.window_start
               < NOW() - ($2::integer * INTERVAL '1 second')
             THEN NOW()
             ELSE star_mart.admin_login_attempts.window_start
           END
         RETURNING count`,
        [key, windowSeconds],
    );

    return Number(rows[0]?.count ?? Number.MAX_SAFE_INTEGER) <= limit;
}

export async function clearRateLimit(bucket, identifier) {
    await pool.query(
        "DELETE FROM star_mart.admin_login_attempts WHERE key = $1",
        [rateLimitKey(bucket, identifier)],
    );
}
