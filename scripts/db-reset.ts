/**
 * Wipes this application's own Postgres schema (`star_mart`) and drizzle's
 * migration log so the app can be migrated from scratch. It never touches the
 * `public` schema, which belongs to the legacy store app sharing the database.
 *
 * It refuses to run unless BOTH guards are satisfied:
 *   1. the --yes flag is passed, and
 *   2. DB_RESET_CONFIRM equals the database name taken from DATABASE_URL.
 * In production you must additionally pass --i-know-this-is-production.
 *
 * Usage:  DB_RESET_CONFIRM=neondb npm run db:reset -- --yes
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { neon } from "@neondatabase/serverless";

const APP_SCHEMA = "star_mart";
const MIGRATIONS_SCHEMA = "drizzle";

function fail(message: string): never {
  console.error(`db:reset refused: ${message}`);
  process.exit(1);
}

async function main() {
  const { values: flags } = parseArgs({
    options: {
      yes: { type: "boolean", default: false },
      "i-know-this-is-production": { type: "boolean", default: false },
    },
  });

  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is not set");

  const dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!dbName) fail("could not read the database name from DATABASE_URL");
  if (!flags.yes) fail("pass --yes to confirm");
  if (process.env.DB_RESET_CONFIRM !== dbName) {
    fail(`set DB_RESET_CONFIRM=${dbName} (it must equal the database name) to confirm`);
  }
  if (process.env.NODE_ENV === "production" && !flags["i-know-this-is-production"]) {
    fail("NODE_ENV is production; pass --i-know-this-is-production as well");
  }

  const sql = neon(url);
  const tables = (await sql`select tablename as name from pg_tables where schemaname = ${APP_SCHEMA} order by 1`) as { name: string }[];
  console.log(`Database: ${dbName}; schema ${APP_SCHEMA} has ${tables.length} tables:`);
  for (const t of tables) console.log(`  ${t.name}`);

  await sql.query(`DROP SCHEMA IF EXISTS "${APP_SCHEMA}" CASCADE`);
  await sql.query(`DROP SCHEMA IF EXISTS "${MIGRATIONS_SCHEMA}" CASCADE`);

  const [remaining] = (await sql`select count(*) as n from pg_namespace where nspname in (${APP_SCHEMA}, ${MIGRATIONS_SCHEMA})`) as { n: string | number }[];
  console.log(`Dropped schemas ${APP_SCHEMA} and ${MIGRATIONS_SCHEMA}. Remaining: ${remaining.n}`);
  if (Number(remaining.n) !== 0) {
    console.error("Some objects survived; inspect the database manually.");
    process.exit(2);
  }
  console.log("Run `npm run db:migrate` to recreate the schema, then `npm run seed:admin`.");
}

main().catch((error) => {
  console.error("db:reset failed:", error);
  process.exit(1);
});
