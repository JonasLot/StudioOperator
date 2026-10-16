"use client";

import * as React from "react";
import { FlaskConical, Loader2, TriangleAlert, Zap } from "lucide-react";
import { setMockModeAction, type MockModeState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Choice = "mock" | "live" | "default";

export function MockModeForm({ current, mockMode, passcodeConfigured, envLabel, durable, savedAt }: { current: "mock" | "live" | null; mockMode: boolean; passcodeConfigured: boolean; envLabel: string; durable: boolean; savedAt: string | null }) {
  const [state, action, pending] = React.useActionState<MockModeState, FormData>(setMockModeAction, undefined);
  const [choice, setChoice] = React.useState<Choice>(current ?? "default");
  const needsPasscode = choice !== "mock";
  const blocked = needsPasscode && !passcodeConfigured;

  const options: { value: Choice; title: string; body: string }[] = [
    { value: "mock", title: "Mock", body: "No external calls and no cost. Briefs are analysed offline and generation is simulated." },
    { value: "live", title: "Live", body: "Real providers wherever a key is set. Generation can spend money, always inside the cap you approve per job." },
    { value: "default", title: "Follow the server environment", body: `Use STUDIO_MOCK_MODE (${envLabel}).` },
  ];

  return (
    // React resets a form after its action runs, which would put the radios back to their initial
    // values while `choice` still says otherwise. Remounting on every result keeps them in step.
    <form key={`${current ?? "default"}|${state?.error ?? state?.message ?? ""}`} action={action} className="flex flex-col gap-4">
      {!durable ? (
        <p className="flex items-start gap-2 rounded-lg border bg-warn-soft px-3 py-2 text-[12.5px]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            This choice is stored in the database, and no remote database is configured (TURSO_DATABASE_URL). On Vercel that means temporary storage: the mode can fall back to the default after a cold start,
            and different server instances can disagree. Connect Turso to make it stick.
          </span>
        </p>
      ) : null}
      <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-[13px]">
        {mockMode ? <FlaskConical className="size-4" /> : <Zap className="size-4 text-ok" />}
        {mockMode ? "Right now: mock mode — no external calls are made." : "Right now: live mode."}
        <span className="ml-auto text-[12px] text-muted-foreground">{current ? "Set here" : "From environment"}</span>
      </p>
      <p className="-mt-2 text-[12px] text-muted-foreground">
        {current && savedAt ? `Stored in the database: ${current}, saved ${savedAt}.` : "Nothing stored in the database — following the server environment."}
      </p>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Mode</legend>
        {options.map((o) => (
          <label key={o.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 ${choice === o.value ? "border-brand bg-brand-soft/40" : ""}`}>
            <input type="radio" name="mode" value={o.value} checked={choice === o.value} onChange={() => setChoice(o.value)} className="mt-1" />
            <span>
              <span className="block text-[13.5px] font-medium">{o.title}</span>
              <span className="block text-[12.5px] text-muted-foreground">{o.body}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {needsPasscode ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mode-passcode">Admin passcode</Label>
          <Input id="mode-passcode" name="passcode" type="password" autoComplete="off" required disabled={!passcodeConfigured} placeholder="Required to leave mock mode" />
          {!passcodeConfigured ? <p className="text-[12px] text-muted-foreground">Set ADMIN_PASSCODE on the server to allow leaving mock mode from here.</p> : null}
        </div>
      ) : null}
      {state?.error ? <p role="alert" className="rounded-lg border bg-bad-soft px-3 py-2 text-[13px]">{state.error}</p> : null}
      {state?.ok ? <p role="status" className="rounded-lg border bg-ok-soft px-3 py-2 text-[13px]">{state.message}</p> : null}
      <Button type="submit" className="w-fit" disabled={pending || blocked}>
        {pending ? <Loader2 className="animate-spin" /> : null} Save mode
      </Button>
      <p className="text-[12px] text-muted-foreground">Live generation also needs the Higgsfield keys and <code className="rounded bg-muted px-1">HIGGSFIELD_WIRE_ENABLED=true</code> on the server. Other running servers pick the change up within a few seconds.</p>
    </form>
  );
}
