"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";
import { saveProfileAction, type ProfileState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileForm({ defaults }: { defaults: { displayName: string; studioName: string; email: string } }) {
  const [state, action, pending] = React.useActionState<ProfileState, FormData>(saveProfileAction, undefined);
  const err = state?.fieldErrors ?? {};
  const shown = state?.values ?? defaults;
  return (
    // React resets a form after its action runs; remounting on each result keeps what was typed visible.
    <form key={state ? `${state.error ?? ""}|${state.message ?? ""}|${shown.email}|${shown.displayName}|${shown.studioName}` : "init"} action={action} className="flex flex-col gap-4">
      <Field id="displayName" label="Your name" hint="Approvals, cleared rights and the audit log are recorded under this name." defaultValue={shown.displayName} error={err.displayName} autoComplete="name" />
      <Field id="studioName" label="Studio name" hint="Shown in the sidebar." defaultValue={shown.studioName} error={err.studioName} autoComplete="organization" />
      <Field id="email" label="Contact email" hint="Optional. For your own reference; the app never sends mail from it." defaultValue={shown.email} error={err.email} type="email" autoComplete="email" />
      {state?.error ? <p role="alert" className="rounded-lg border bg-bad-soft px-3 py-2 text-[13px]">{state.error}</p> : null}
      {state?.ok ? <p role="status" className="rounded-lg border bg-ok-soft px-3 py-2 text-[13px]">{state.message}</p> : null}
      <Button type="submit" className="w-fit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />} Save profile
      </Button>
    </form>
  );
}

function Field({ id, label, hint, error, ...props }: { id: string; label: string; hint: string; error?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} aria-invalid={error ? true : undefined} {...props} />
      <p className={error ? "text-[12px] text-bad" : "text-[12px] text-muted-foreground"}>{error ?? hint}</p>
    </div>
  );
}
