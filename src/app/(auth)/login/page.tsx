import type { Metadata } from "next";
import Image from "next/image";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { loginErrorMessage } from "@/lib/auth/errors";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { safeCallbackUrl } from "@/lib/security/redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  expired: "Your session has ended. Please sign in again.",
  password_changed: "Your password was changed. Sign in with the new password.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(firstParam(params.callbackUrl));
  const notice = NOTICES[firstParam(params.reason) ?? ""] ?? null;
  // Auth.js lands here with ?error=...&code=... when its callback endpoint is used directly.
  const initialError = firstParam(params.error) ? loginErrorMessage(firstParam(params.code)) : null;

  return (
    <div className="grid min-h-screen bg-[#fafaf8] lg:grid-cols-2">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#15231e] lg:block" aria-label="Star Mart checkout">
        <Image
          src="/star-mart-pos-terminal.png"
          alt="Star Mart point-of-sale terminal on a checkout counter"
          fill
          priority
          sizes="50vw"
          className="object-cover object-center"
        />
        <div className="pointer-events-none absolute inset-0 bg-black/20" />
      </section>

      <section className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10 lg:px-14 xl:px-20">
        <div className="w-full max-w-md">
          <div className="mb-10">
            <Image
              src="/star-mart-logo.png"
              alt="Star Mart"
              width={746}
              height={301}
              priority
              className="mb-10 h-auto w-52 object-contain sm:w-60"
            />
            <p className="mb-3 text-sm font-semibold tracking-wide text-[#087443]">ADMIN PORTAL</p>
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-[#18221e] sm:text-4xl">
              Welcome to Star Mart
            </h1>
            <p className="mt-3 text-base leading-6 text-[#68736d]">
              Sign in with your administrator account.
            </p>
          </div>
          <div className="grid gap-5">
            {notice ? (
              <Alert>
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            ) : null}
            <LoginForm callbackUrl={callbackUrl} initialError={initialError} />
          </div>
          <p className="mt-12 text-center text-xs text-[#89928d]">
            Secure access for Star Mart team members
          </p>
        </div>
      </section>
    </div>
  );
}
