import { Pool } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for customer authentication");
}

const globalForDatabase = globalThis;

export const pool = globalForDatabase.customerDatabasePool
    ?? new Pool({ connectionString: databaseUrl });

if (process.env.NODE_ENV !== "production") {
    globalForDatabase.customerDatabasePool = pool;
}
