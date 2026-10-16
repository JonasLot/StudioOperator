"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { saveAutonomyAction, type AutonomyState } from "@/app/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MESSAGE_TYPES, MESSAGE_TYPE_LABEL, PAUSE_CONDITIONS, PAUSE_LABEL, type AutonomySettings } from "@/lib/domain/types";

function Toggle({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13.5px] has-[:checked]:border-brand/40 has-[:checked]:bg-brand-soft/40">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-[var(--brand,#111)]" />
      <span>
        <span className="block font-medium">{label}</span>
        {hint ? <span className="block text-[12px] text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

function Num({ name, label, suffix, defaultValue, step = "1" }: { name: string; label: string; suffix?: string; defaultValue: number; step?: string }) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <div className="flex items-center gap-2">
        <Input name={name} type="number" min="0" step={step} inputMode="decimal" defaultValue={defaultValue} className="tnum w-36" />
        {suffix ? <span className="text-[13px] text-muted-foreground">{suffix}</span> : null}
      </div>
    </div>
  );
}

export function AutonomyForm({ settings }: { settings: AutonomySettings }) {
  const [state, action, pending] = React.useActionState<AutonomyState, FormData>(saveAutonomyAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-6">
      {state?.error ? (
        <Alert variant="bad"><AlertTitle>Couldn’t save</AlertTitle><AlertDescription>{state.error}</AlertDescription></Alert>
      ) : null}
      {state?.ok ? (
        <Alert><AlertTitle className="flex items-center gap-1.5"><Check className="size-4 text-ok" /> Saved</AlertTitle><AlertDescription>Autonomy settings updated.</AlertDescription></Alert>
      ) : null}

      <section className="rounded-xl border bg-card">
        <h2 className="border-b px-5 py-3.5 text-[15px] font-semibold">Spend & attempts</h2>
        <div className="grid gap-5 px-5 py-5 sm:grid-cols-3">
          <Num name="maxAutoSpendPerJobUsd" label="Max automatic spend / job" suffix="USD" defaultValue={settings.maxAutoSpendPerJobUsd} />
          <Num name="maxAutoSpendPerRepairUsd" label="Max automatic spend / repair" suffix="USD" defaultValue={settings.maxAutoSpendPerRepairUsd} />
          <Num name="maxAttemptsPerStep" label="Max generation attempts / step" defaultValue={settings.maxAttemptsPerStep} />
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <h2 className="border-b px-5 py-3.5 text-[15px] font-semibold">Allowed model families</h2>
        <div className="px-5 py-5">
          <Label className="mb-1.5 block">Families the agent may choose on its own</Label>
          <Input name="allowedModelFamilies" defaultValue={settings.allowedModelFamilies.join(", ")} placeholder="soul, cinema, kling, …" />
          <p className="mt-1.5 text-[12px] text-muted-foreground">Comma-separated. A repair on a model outside these families escalates to you.</p>
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <h2 className="border-b px-5 py-3.5 text-[15px] font-semibold">Messages that may be sent automatically</h2>
        <div className="grid gap-2.5 px-5 py-5 sm:grid-cols-3">
          {MESSAGE_TYPES.map((t) => (
            <Toggle key={t} name={`msg_${t}`} label={MESSAGE_TYPE_LABEL[t]} defaultChecked={settings.autoSendMessageTypes.includes(t)} />
          ))}
        </div>
        <p className="px-5 pb-4 text-[12px] text-muted-foreground">Everything else is drafted for your approval. Third-party marketplaces are never auto-sent, regardless of these switches.</p>
      </section>

      <section className="rounded-xl border bg-card">
        <h2 className="border-b px-5 py-3.5 text-[15px] font-semibold">Concepts & delivery</h2>
        <div className="grid gap-2.5 px-5 py-5 sm:grid-cols-2">
          <Toggle name="autoShareConcepts" label="Share concepts automatically" defaultChecked={settings.autoShareConcepts} hint="Off = concepts are drafted for your approval." />
          <Toggle name="finalDeliveryAlwaysApproval" label="Final delivery always requires approval" defaultChecked={settings.finalDeliveryAlwaysApproval} hint="Strongly recommended on." />
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <h2 className="border-b px-5 py-3.5 text-[15px] font-semibold">Always pause for a human</h2>
        <div className="grid gap-2.5 px-5 py-5 sm:grid-cols-2">
          {PAUSE_CONDITIONS.map((c) => (
            <Toggle key={c} name={`pause_${c}`} label={PAUSE_LABEL[c]} defaultChecked={settings.alwaysPause[c]} />
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} Save autonomy settings</Button>
        <span className="text-[12px] text-muted-foreground">These apply to every job the agent runs.</span>
      </div>
    </form>
  );
}
