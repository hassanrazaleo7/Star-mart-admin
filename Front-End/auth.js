import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { pool } from "./lib/db.js";
import { clearRateLimit, consumeRateLimit, getClientIp } from "./lib/auth/rate-limit.js";
import {
    burnPasswordVerification,
    hashPassword,
    isLegacyScryptHash,
    performDummyPasswordCheck,
    verifyPassword,
} from "./lib/auth/password.js";

const sessionLifetimeSeconds = 7 * 24 * 60 * 60;
const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;

function hashSessionToken(sessionToken) {
    return createHash("sha256").update(sessionToken).digest("hex");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    pages: {
        signIn: "/sign-in",
    },
    providers: [
        Credentials({
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                const email = typeof credentials?.email === "string"
                    ? credentials.email.trim().toLowerCase()
                    : "";
                const password = typeof credentials?.password === "string"
                    ? credentials.password
                    : "";

                if (!validEmail.test(email) || email.length > 254 || !password || Buffer.byteLength(password, "utf8") > 1024) {
                    return null;
                }

                const requestHeaders = await headers();
                const ip = getClientIp(requestHeaders);
                const ipAllowed = await consumeRateLimit("login-ip", ip, 50, 15 * 60);
                const emailAllowed = ipAllowed
                    ? await consumeRateLimit("login-email", email, 10, 15 * 60)
                    : false;

                if (!ipAllowed || !emailAllowed) {
                    return null;
                }

                const { rows } = await pool.query(
                    `SELECT id, name, email, password_hash, salt
                     FROM public.customer_accounts
                     WHERE lower(email) = $1
                     LIMIT 1`,
                    [email],
                );
                const account = rows[0];

                if (!account) {
                    await performDummyPasswordCheck(password);
                    return null;
                }

                const passwordMatches = await verifyPassword(password, account.salt, account.password_hash);

                if (!passwordMatches) {
                    await burnPasswordVerification(password, account.password_hash);
                    return null;
                }

                if (isLegacyScryptHash(account.password_hash)) {
                    const upgraded = await hashPassword(password);
                    await pool.query(
                        `UPDATE public.customer_accounts
                         SET password_hash = $1, salt = $2
                         WHERE id = $3 AND password_hash = $4`,
                        [upgraded.passwordHash, upgraded.salt, account.id, account.password_hash],
                    );
                }

                const sessionToken = randomBytes(32).toString("base64url");
                await pool.query(
                    `INSERT INTO public.customer_sessions (token_hash, customer_id, expires_at)
                     VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
                    [hashSessionToken(sessionToken), account.id],
                );
                await clearRateLimit("login-email", email);
                if (ip) await clearRateLimit("login-ip", ip);

                return {
                    id: account.id,
                    name: account.name,
                    email: account.email,
                    sessionToken,
                };
            },
        }),
    ],
    session: {
        strategy: "jwt",
        maxAge: sessionLifetimeSeconds,
    },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.userId = user.id;
                token.sessionToken = user.sessionToken;
                token.name = user.name;
                token.email = user.email;
            }

            if (typeof token.userId !== "string" || typeof token.sessionToken !== "string") {
                return null;
            }

            const result = await pool.query(
                `UPDATE public.customer_sessions
                 SET expires_at = NOW() + INTERVAL '7 days'
                 WHERE token_hash = $1 AND expires_at > NOW()`,
                [hashSessionToken(token.sessionToken)],
            );

            return result.rowCount === 1 ? token : null;
        },
        async session({ session, token }) {
            if (session.user && typeof token.userId === "string") {
                session.user.id = token.userId;
            }

            return session;
        },
    },
    events: {
        async signOut({ token }) {
            if (typeof token?.sessionToken === "string") {
                await pool.query(
                    "DELETE FROM public.customer_sessions WHERE token_hash = $1",
                    [hashSessionToken(token.sessionToken)],
                );
            }
        },
    },
});
