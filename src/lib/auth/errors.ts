import { CredentialsSignin } from "next-auth";

// The `code` ends up in a URL on the Auth.js redirect flow, so it must stay generic.
export class InvalidCredentialsError extends CredentialsSignin {
  code = "invalid_credentials";
}

export class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Invalid email or password.",
  rate_limited: "Too many attempts. Please wait a few minutes and try again.",
};

export function loginErrorMessage(code?: string | null): string {
  return (code && LOGIN_ERROR_MESSAGES[code]) || "Unable to sign in. Please try again.";
}
