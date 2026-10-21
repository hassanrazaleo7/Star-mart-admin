// Dependency-free Vercel Blob URL checks, shared by server actions and client components.
//
// Product images are rendered straight from their Blob URL (<img src>, next/image remote
// patterns and the CSP img-src all allow *.public.blob.vercel-storage.com only), so they
// must live in a Blob store created with PUBLIC access. A private store accepts the same
// uploads but returns *.private.blob.vercel-storage.com URLs that need a token to read.

const PUBLIC_BLOB_HOST = /\.public\.blob\.vercel-storage\.com$/;
const PRIVATE_BLOB_HOST = /\.private\.blob\.vercel-storage\.com$/;

export const PRIVATE_BLOB_STORE_MESSAGE =
  "The connected Vercel Blob store is private, so product images cannot be displayed. Create a Blob store with Public access (the access mode cannot be changed after creation), connect it, and update BLOB_READ_WRITE_TOKEN, BLOB_STORE_ID and BLOB_WEBHOOK_PUBLIC_KEY.";

function httpsHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.hostname : null;
  } catch {
    return null;
  }
}

/** True for URLs served directly from a public Vercel Blob store (what product images require). */
export function isPublicBlobUrl(url: string): boolean {
  const host = httpsHost(url);
  return host !== null && PUBLIC_BLOB_HOST.test(host);
}

/** True for URLs of blobs in a private store (readable only with a token). */
export function isPrivateBlobUrl(url: string): boolean {
  const host = httpsHost(url);
  return host !== null && PRIVATE_BLOB_HOST.test(host);
}

/** Null when the image URL is acceptable (absent, or a public Blob URL); otherwise a user-facing reason. */
export function describeImageUrlProblem(url: string | null | undefined): string | null {
  if (!url) return null;
  if (isPublicBlobUrl(url)) return null;
  if (isPrivateBlobUrl(url)) return PRIVATE_BLOB_STORE_MESSAGE;
  return "Image URL must point to the configured public Blob store.";
}
