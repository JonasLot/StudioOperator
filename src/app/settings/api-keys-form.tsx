"use client";

import * as React from "react";
import { CheckCircle2, CircleSlash, KeyRound, Loader2, TriangleAlert } from "lucide-react";
import { saveApiKeysAction, type ApiKeysState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface KeyRow {
  name: string;
  label: string;
  description: string;
  source: "settings" | "environment" | "none";
  hint: string | null;
}

const SOURCE_LABEL = { settings: "Saved here", environment: "From environment", none: "Not set" } as const;

export function ApiKeysForm({ rows, enabled, durable }: { rows: KeyRow[]; enabled: boolean; durable: boolean }) {
  const [state, action, pending] = React.useActionState<ApiKeysState, FormData>(saveApiKeysAction, undefined);
  const formRef = React.useRef<HTMLFormElement>(null);
  // Clear typed secrets as soon as a save succeeds; they should not linger in the page.
  React.useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  if (!enabled) {
    return (
      <div className="flex items-start gap-2 rounded-lg border bg-muted px-3 py-3 text-[13px]">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <span>
          Saving keys from this page is switched off. Add an <code className="rounded bg-card px-1">ADMIN_PASSCODE</code> environment variable (at least 12
          characters) to the server and redeploy to turn it on. Until then, keys are read from environment variables only.
        </span>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} autoComplete="off" className="flex flex-col gap-5">
      {!durable ? (
        <p className="flex items-start gap-2 rounded-lg border bg-warn-soft px-3 py-2 text-[12.5px]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>No remote database is configured (TURSO_DATABASE_URL), so saved keys live in temporary storage and can disappear on a redeploy or cold start.</span>
        </p>
      ) : null}

      <ul className="flex flex-col gap-4">
        {rows.map((r) => (
          <li key={r.name} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor={r.name}>{r.label}</Label>
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                {r.source === "none" ? <CircleSlash className="size-3.5" /> : <CheckCircle2 className="size-3.5 text-ok" />}
                {SOURCE_LABEL[r.source]}
                {r.hint ? <span className="tnum font-mono">{r.hint}</span> : null}
              </span>
            </div>
            <Input id={r.name} name={r.name} type="password" autoComplete="off" spellCheck={false} placeholder={r.source === "none" ? "Paste key" : "Paste a new key to replace it"} />
            <p className="text-[12px] text-muted-foreground">{r.description}</p>
            {r.source === "settings" ? (
              <label className="flex w-fit items-center gap-2 text-[12.5px]">
                <input type="checkbox" name={`remove_${r.name}`} /> Remove the saved key (use the environment variable instead)
              </label>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1.5 border-t pt-4">
        <Label htmlFor="passcode">Admin passcode</Label>
        <Input id="passcode" name="passcode" type="password" required autoComplete="off" placeholder="Required for every change" />
      </div>

      {state?.error ? <p role="alert" className="rounded-lg border bg-bad-soft px-3 py-2 text-[13px]">{state.error}</p> : null}
      {state?.ok ? <p role="status" className="rounded-lg border bg-ok-soft px-3 py-2 text-[13px]">{state.message}</p> : null}

      <Button type="submit" className="w-fit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <KeyRound />} Save keys
      </Button>
    </form>
  );
}
