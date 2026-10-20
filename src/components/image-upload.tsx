"use client";

import { uploadPresigned } from "@vercel/blob/client";
import { ImageIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Props = {
  enabled: boolean;
  initialUrl?: string | null;
  initialPathname?: string | null;
  folder?: string;
};

const MAX_EDGE = 1200;

async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 400_000) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not process image"))), "image/jpeg", 0.85),
  );
}

/** Direct-to-Blob image upload; the resulting URL is submitted with the surrounding form. */
export function ImageUpload({ enabled, initialUrl, initialPathname, folder = "products" }: Props) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [pathname, setPathname] = useState(initialPathname ?? "");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    setProgress(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120_000);
    try {
      const blob = await downscale(file);
      const name = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "image";
      const result = await uploadPresigned(`${folder}/${name}-${crypto.randomUUID()}.jpg`, blob, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        contentType: "image/jpeg",
        abortSignal: controller.signal,
        onUploadProgress: ({ percentage }) => setProgress(percentage),
      });
      setUrl(result.url);
      setPathname(result.pathname);
    } catch (err) {
      setError(
        controller.signal.aborted
          ? "Upload timed out. Check Vercel dev logs and Blob OIDC configuration, then try again."
          : (err as Error).message || "Upload failed",
      );
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
      setProgress(null);
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
                  {busy ? (progress === null ? "Preparing upload…" : `Uploading ${progress}%…`) : url ? "Replace image" : "Upload image"}
                </Button>
                {url ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setUrl(""); setPathname(""); }}>
                    <Trash2Icon />
                    Remove
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">JPEG, PNG or WebP. Resized to {MAX_EDGE}px before upload.</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Image upload is not configured. Set BLOB_STORE_ID and BLOB_WEBHOOK_PUBLIC_KEY in your environment.</p>
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
