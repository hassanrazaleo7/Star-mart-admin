import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (see .env.example)");
}

// Every table lives in the `star_mart` Postgres schema; `public` belongs to the
// legacy store app, so drizzle-kit is told to ignore everything else.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["star_mart"],
  dbCredentials: { url: process.env.DATABASE_URL },
  strict: true,
  verbose: true,
});
