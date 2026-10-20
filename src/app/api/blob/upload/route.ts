import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { getCurrentSession } from "@/lib/auth/session";
import { isManager } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const BLOB_CONFIGURATION_ERROR =
  "Image upload needs a Blob write credential. Set BLOB_READ_WRITE_TOKEN for local development or enable Vercel OIDC.";

function normalizeWebhookPublicKey(key: string): string {
  if (key.includes("-----BEGIN PUBLIC KEY-----")) return key;
  return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
}

/** Authorize direct browser uploads to Vercel Blob (product images). */
export async function POST(request: Request): Promise<NextResponse> {
  if (!env.blobConfigured || !env.BLOB_STORE_ID || !env.BLOB_WEBHOOK_PUBLIC_KEY) {
    return NextResponse.json({ error: BLOB_CONFIGURATION_ERROR }, { status: 503 });
  }
  try {
    const body = (await request.json()) as HandleUploadPresignedBody;
    if (body.type === "blob.generate-presigned-url") {
      const ctx = await getCurrentSession();
      if (!ctx || !(isManager(ctx.user.role) || ctx.user.role === "vendor")) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
    }

    const result = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => {
        if (!pathname.startsWith("products/")) throw new Error("Invalid upload path");
        return {
          token: await issueSignedToken({
            pathname,
            operations: ["put"],
            allowedContentTypes: ["image/jpeg"],
            maximumSizeInBytes: MAX_IMAGE_BYTES,
            storeId: env.BLOB_STORE_ID,
            token: env.BLOB_READ_WRITE_TOKEN,
          }),
          urlOptions: {
            allowedContentTypes: ["image/jpeg"],
            maximumSizeInBytes: MAX_IMAGE_BYTES,
          },
        };
      },
      webhookPublicKey: normalizeWebhookPublicKey(env.BLOB_WEBHOOK_PUBLIC_KEY),
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[blob] upload authorization failed:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
