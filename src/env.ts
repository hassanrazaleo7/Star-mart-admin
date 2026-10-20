import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = (max = 500) => z.preprocess(emptyToUndefined, z.string().max(max).optional());
const optionalBool = () => z.preprocess(emptyToUndefined, z.enum(["true", "false"]).default("false"));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .startsWith("postgresql://", "DATABASE_URL must be a postgresql:// connection string"),
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters (generate one with: openssl rand -base64 48)"),
  AUTH_TRUST_HOST: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).default("true")),
  AUTH_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  PASSWORD_HIBP_CHECK: optionalBool(),
  // Integrations (all optional: the app runs without them and shows "not configured").
  BLOB_READ_WRITE_TOKEN: optionalString(2000),
  BLOB_STORE_ID: optionalString(200),
  BLOB_WEBHOOK_PUBLIC_KEY: optionalString(2000),
  BREVO_API_KEY: optionalString(500),
  BREVO_SENDER_EMAIL: z.preprocess(emptyToUndefined, z.email().optional()),
  BREVO_SENDER_NAME: optionalString(100),
  BREVO_DRY_RUN: optionalBool(),
  CRON_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:\n" + z.prettifyError(parsed.error));
  throw new Error("Invalid environment variables; see .env.example");
}

export const env = {
  ...parsed.data,
  PASSWORD_HIBP_CHECK: parsed.data.PASSWORD_HIBP_CHECK === "true",
  BREVO_DRY_RUN: parsed.data.BREVO_DRY_RUN === "true",
  isProduction: parsed.data.NODE_ENV === "production",
  blobConfigured: Boolean(parsed.data.BLOB_STORE_ID && parsed.data.BLOB_WEBHOOK_PUBLIC_KEY),
  emailConfigured: Boolean(parsed.data.BREVO_API_KEY && parsed.data.BREVO_SENDER_EMAIL),
};
