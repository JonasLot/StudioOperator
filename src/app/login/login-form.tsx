"use client";

import * as React from "react";
import { Loader2, LogIn } from "lucide-react";
import { loginAction, type LoginState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = React.useActionState<LoginState, FormData>(loginAction, undefined);
  return (
    <form action={action} className="mt-5 flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="passcode">Passcode</Label>
        <Input id="passcode" name="passcode" type="password" required autoFocus autoComplete="current-password" />
      </div>
      {state?.error ? (
        <p role="alert" className="rounded-lg border bg-bad-soft px-3 py-2 text-[13px]">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <LogIn />} Sign in
      </Button>
    </form>
  );
}
