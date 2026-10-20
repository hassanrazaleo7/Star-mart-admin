import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { getCurrentSession } from "@/lib/auth/session";
import { isManager } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Token exchange for direct browser uploads to Vercel Blob (product images). */
export async function POST(request: Request): Promise<NextResponse> {
  if (!env.blobConfigured) {
    return NextResponse.json({ error: "Image upload is not configured" }, { status: 503 });
  }
  const ctx = await getCurrentSession();
  if (!ctx || !(isManager(ctx.user.role) || ctx.user.role === "vendor")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("products/")) throw new Error("Invalid upload path");
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: 2 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: ctx.user.id }),
        };
      },
      // Vercel calls this webhook after the upload; it never reaches localhost, so the
      // product form submits the returned URL itself (validated server-side).
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
