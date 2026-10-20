import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "@/env";
import * as schema from "./schema";

// Neon HTTP driver: stateless, serverless-friendly. It has no interactive
// transactions, so multi-statement writes use db.batch() (one implicit
// transaction) or single conditional statements.
const client = neon(env.DATABASE_URL);

export const db = drizzle({ client, schema });
export type Db = typeof db;
