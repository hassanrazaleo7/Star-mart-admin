"use client";

import { uploadPresigned } from "@vercel/blob/client";
import { ImageIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { isPrivateBlobUrl, isPublicBlobUrl, PRIVATE_BLOB_STORE_MESSAGE } from "@/lib/blob-urls";

type Props = {
  enabled: boolean;
  initialUrl?: string | null;
  initialPathname?: string | null;
  folder?: string;
  onUploadingChange: (uploading: boolean) => void;
};

const MAX_EDGE = 1200;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_DURATION_MS = 120_000;
const HANDLE_UPLOAD_URL = "/api/blob/upload";
// The SDK replaces whatever the authorization route answered with this generic message
// (prefixed with "Vercel Blob: " by its error class).
const SDK_AUTHORIZATION_ERROR = /Failed to retrieve the presigned URL/i;

/** Turns an upload failure into a message that says what to fix. */
async function explainUploadError(error: unknown, target: string): Promise<string> {
  const message = error instanceof Error ? error.message : "";
  if (SDK_AUTHORIZATION_ERROR.test(message)) {
    // Ask the authorization route again to surface its real reason (403/503 body, expired session…).
    try {
      const res = await fetch(HANDLE_UPLOAD_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "blob.generate-presigned-url", payload: { pathname: target, clientPayload: null, multipart: false } }),
      });
      if (res.redirected) return "Your session has expired. Sign in again and retry the upload.";
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (data?.error) return data.error;
      return res.ok ? "Upload authorization failed temporarily. Try again." : `Upload authorization failed (HTTP ${res.status}).`;
    } catch {
      return "Could not reach the upload endpoint.";
    }
  }
  if (/network request failed|failed to fetch|load failed|networkerror/i.test(message)) {
    return "The browser could not reach Vercel Blob (network error, or a Content-Security-Policy that blocks https://vercel.com/api/blob/).";
  }
  return message || "Upload failed";
}

async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * scale));
    let height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not process image");
    context.drawImage(bitmap, 0, 0, width, height);

    while (true) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
      if (!blob) throw new Error("Could not encode image");
      if (blob.size <= MAX_UPLOAD_BYTES) return blob;

      width = Math.max(1, Math.floor(width * 0.85));
      height = Math.max(1, Math.floor(height * 0.85));
      if (width === canvas.width && height === canvas.height) {
        throw new Error("Could not compress image to the 2 MB upload limit");
      }
      canvas.width = width;
      canvas.height = height;
      context.drawImage(bitmap, 0, 0, width, height);
    }
  } finally {
    bitmap.close();
  }
}

/** Direct-to-Blob image upload; the resulting URL is submitted with the surrounding form. */
export function ImageUpload({ enabled, initialUrl, initialPathname, folder = "products", onUploadingChange }: Props) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [pathname, setPathname] = useState(initialPathname ?? "");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"preparing" | "connecting" | "uploading">("preparing");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    onUploadingChange(true);
    setProgress(null);
    setPhase("preparing");
    const controller = new AbortController();
    let currentStage = "preparing the image";
    let timeout: number | undefined;
    let timedOut = false;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error(`Image upload timed out while ${currentStage}.`));
      }, MAX_UPLOAD_DURATION_MS);
    });
    const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "image";
    const target = `${folder}/${baseName}-${crypto.randomUUID()}.jpg`;
    try {
      await Promise.race([
        (async () => {
          const blob = await downscale(file);
          currentStage = "connecting to Blob";
          setPhase("connecting");
          const result = await uploadPresigned(target, blob, {
            access: "public",
            handleUploadUrl: HANDLE_UPLOAD_URL,
            contentType: "image/jpeg",
            abortSignal: controller.signal,
            onUploadProgress: ({ percentage }) => {
              currentStage = "uploading to Blob";
              setPhase("uploading");
              setProgress(percentage);
            },
          });
          // A private store silently returns a URL that nobody can display; refuse it here so the
          // form never submits it and the real fix (a public store) is shown.
          if (!isPublicBlobUrl(result.url)) {
            throw new Error(isPrivateBlobUrl(result.url) ? PRIVATE_BLOB_STORE_MESSAGE : "The upload returned an unexpected URL.");
          }
          setUrl(result.url);
          setPathname(result.pathname);
        })(),
        timeoutPromise,
      ]);
    } catch (err) {
      setError(timedOut ? `Image upload timed out while ${currentStage}.` : await explainUploadError(err, target));
    } finally {
      if (timeout !== undefined) window.clearTimeout(timeout);
      setBusy(false);
      onUploadingChange(false);
      setProgress(null);
      setPhase("preparing");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-3">
      <input type="hidden" name="imageUrl" value={url} />
      <input type="hidden" name="imagePathname" value={pathname} />
      <div className="flex items-start gap-4">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-8 text-muted-foreground" />
          )}
        </div>
        <div className="grid gap-2">
          {enabled ? (
            <>
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
                  <UploadIcon />
                  {busy
                    ? phase === "preparing"
                      ? "Preparing image…"
                      : phase === "connecting"
                        ? "Connecting to Blob…"
                        : `Uploading ${progress ?? 0}%…`
                    : url
                      ? "Replace image"
                      : "Upload image"}
                </Button>
                {url ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setUrl(""); setPathname(""); }}>
                    <Trash2Icon />
                    Remove
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">JPEG, PNG or WebP, resized to {MAX_EDGE}px and compressed to fit the 2 MB upload limit.</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Image upload needs a Blob write credential. Set BLOB_READ_WRITE_TOKEN for local development, or enable Vercel OIDC for deployment.
            </p>
          )}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>
    </div>
  );
}
