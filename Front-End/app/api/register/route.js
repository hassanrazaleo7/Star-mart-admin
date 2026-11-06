import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { pool } from "../../../lib/db.js";
import { hashPassword } from "../../../lib/auth/password.js";
import { consumeRateLimit, getClientIp } from "../../../lib/auth/rate-limit.js";

export const runtime = "nodejs";

const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;

function isSameOrigin(request) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

    if (!origin || !host) {
        return false;
    }

    try {
        return new URL(origin).host === host;
    } catch {
        return false;
    }
}

export async function POST(request) {
    if (!isSameOrigin(request)) {
        return NextResponse.json({ error: "Request could not be verified." }, { status: 403 });
    }

    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        return NextResponse.json({ error: "Invalid request format." }, { status: 415 });
    }

    let input;
    try {
        input = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid registration details." }, { status: 400 });
    }

    const name = typeof input?.name === "string" ? input.name.trim() : "";
    const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
    const password = typeof input?.password === "string" ? input.password : "";

    if (
        name.length < 1
        || name.length > 120
        || !validEmail.test(email)
        || email.length > 254
        || password.length < 12
        || password.length > 128
        || Buffer.byteLength(password, "utf8") > 512
    ) {
        return NextResponse.json(
            { error: "Enter a valid name and email, and use a password with at least 12 characters." },
            { status: 400 },
        );
    }

    const ip = getClientIp(request.headers);
    const ipAllowed = await consumeRateLimit("register-ip", ip, 20, 15 * 60);
    const emailAllowed = ipAllowed
        ? await consumeRateLimit("register-email", email, 5, 60 * 60)
        : false;

    if (!ipAllowed || !emailAllowed) {
        return NextResponse.json(
            { error: "Too many registration attempts. Please wait and try again." },
            { status: 429 },
        );
    }

    const { passwordHash, salt } = await hashPassword(password);
    const client = await pool.connect();
    let transactionStarted = false;

    try {
        await client.query("BEGIN");
        transactionStarted = true;
        await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
            [email],
        );

        const existing = await client.query(
            "SELECT id FROM public.customer_accounts WHERE lower(email) = $1 LIMIT 1",
            [email],
        );

        if (existing.rowCount > 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return NextResponse.json(
                { error: "Unable to create an account with those details. Please sign in or use another email." },
                { status: 409 },
            );
        }

        const existingCustomer = await client.query(
            `SELECT id
             FROM star_mart.customers
             WHERE lower(email) = $1
             ORDER BY created_at, id
             LIMIT 1`,
            [email],
        );
        const customerId = existingCustomer.rows[0]?.id ?? randomUUID();

        if (existingCustomer.rowCount === 0) {
            await client.query(
                `INSERT INTO star_mart.customers (id, name, email)
                 VALUES ($1, $2, $3)`,
                [customerId, name, email],
            );
        }

        const inserted = await client.query(
            `INSERT INTO public.customer_accounts (id, name, email, password_hash, salt)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (email) DO NOTHING
             RETURNING id`,
            [customerId, name, email, passwordHash, salt],
        );

        if (inserted.rowCount !== 1) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return NextResponse.json(
                { error: "Unable to create an account with those details. Please sign in or use another email." },
                { status: 409 },
            );
        }

        await client.query("COMMIT");
        transactionStarted = false;
        return NextResponse.json({ created: true }, { status: 201 });
    } catch (error) {
        if (transactionStarted) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Customer registration rollback failed", rollbackError);
            }
        }

        console.error("Customer registration failed", error);
        return NextResponse.json(
            { error: "Unable to create your account right now. Please try again later." },
            { status: 500 },
        );
    } finally {
        client.release();
    }
}
