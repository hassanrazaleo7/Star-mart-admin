"use client";

import { EyeIcon, EyeOffIcon, LockKeyholeIcon, MailIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "./actions";

type Props = { callbackUrl: string; initialError: string | null };

export function LoginForm({ callbackUrl, initialError }: Props) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {
    error: initialError,
    email: "",
  });
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div className="grid gap-1.5">
        <Label htmlFor="email" className="text-xs font-medium text-[#29352f]">Email address</Label>
        <div className="relative">
          <MailIcon aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#89928d]" />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            maxLength={254}
            defaultValue={state.email ?? ""}
            autoFocus
            placeholder="you@starmartstore.com"
            className="h-11 rounded-xl border-[#dfe4df] bg-white pl-10 text-sm shadow-sm transition focus-visible:border-[#087443] focus-visible:ring-[#087443]/15"
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-xs font-medium text-[#29352f]">Password</Label>
        </div>
        <div className="relative">
          <LockKeyholeIcon aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#89928d]" />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            maxLength={128}
            placeholder="Enter your password"
            className="h-11 rounded-xl border-[#dfe4df] bg-white pl-10 pr-12 text-sm shadow-sm transition focus-visible:border-[#087443] focus-visible:ring-[#087443]/15"
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#77817b] transition-colors hover:text-[#087443] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087443]/30"
          >
            {showPassword ? <EyeOffIcon aria-hidden="true" className="size-[18px]" /> : <EyeIcon aria-hidden="true" className="size-[18px]" />}
          </button>
        </div>
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending} className="mt-1 h-11 w-full rounded-xl bg-[#fb0101] text-sm font-semibold shadow-[0_8px_18px_-8px_rgba(251,1,1,0.55)] hover:bg-[#df0000]">
        {pending ? "Signing in…" : "Sign In"}
      </Button>
    </form>
  );
}
