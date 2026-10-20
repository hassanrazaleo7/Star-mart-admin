import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { getCurrentSession } from "@/lib/auth/session";
import { isManager } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function normalizeWebhookPublicKey(key: string): string {
  if (key.includes("-----BEGIN PUBLIC KEY-----")) return key;
  return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
}

/** Authorize direct browser uploads to Vercel Blob (product images). */
export async function POST(request: Request): Promise<NextResponse> {
  if (!env.BLOB_STORE_ID || !env.BLOB_WEBHOOK_PUBLIC_KEY) {
    return NextResponse.json({ error: "Image upload is not configured" }, { status: 503 });
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
            maximumSizeInBytes: 2 * 1024 * 1024,
            storeId: env.BLOB_STORE_ID,
          }),
          urlOptions: {
            allowedContentTypes: ["image/jpeg"],
            maximumSizeInBytes: 2 * 1024 * 1024,
          },
        };
      },
      webhookPublicKey: normalizeWebhookPublicKey(env.BLOB_WEBHOOK_PUBLIC_KEY),
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
