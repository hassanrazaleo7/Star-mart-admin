import type { Metadata } from "next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loginErrorMessage } from "@/lib/auth/errors";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { safeCallbackUrl } from "@/lib/security/redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  expired: "Your session has ended. Please sign in again.",
  password_changed: "Your password was changed. Sign in with the new password.",
  logged_out: "You have been signed out.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(firstParam(params.callbackUrl));
  const notice = NOTICES[firstParam(params.reason) ?? ""] ?? null;
  // Auth.js lands here with ?error=...&code=... when its callback endpoint is used directly.
  const initialError = firstParam(params.error) ? loginErrorMessage(firstParam(params.code)) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Star Mart Admin</CardTitle>
        <CardDescription>Sign in with your administrator account.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {notice ? (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
        <LoginForm callbackUrl={callbackUrl} initialError={initialError} />
      </CardContent>
    </Card>
  );
}
