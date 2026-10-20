"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendTestEmailAction, type TestEmailState } from "./actions";

export function TestEmailForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, formAction, pending] = useActionState<TestEmailState, FormData>(async (prev, fd) => {
    const r = await sendTestEmailAction(prev, fd);
    if (r.ok) toast.success("Test email queued and processed; see the outbox below.", { id: "test-email" });
    return r;
  }, { error: null });
  return (
    <form action={formAction} className="flex flex-wrap gap-2">
      <Input name="email" type="email" defaultValue={defaultEmail} placeholder="you@example.com" className="max-w-xs" required aria-label="Recipient" data-scanner-ignore />
      <Button type="submit" variant="outline" disabled={pending}>{pending ? "Sending…" : "Send test email"}</Button>
      {state.error ? <Alert variant="destructive" className="basis-full"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
    </form>
  );
}
