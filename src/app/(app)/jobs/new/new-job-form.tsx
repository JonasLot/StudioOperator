"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import { createJobAction, type NewJobState } from "@/app/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { JOB_SOURCES, SOURCE_LABEL, type JobSource } from "@/lib/domain/types";

function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
      {error?.length ? <p className="mt-1 text-xs text-bad">{error[0]}</p> : null}
    </div>
  );
}

export function NewJobForm({ feeDefaults, defaultDeadline }: { feeDefaults: Record<JobSource, number>; defaultDeadline: string }) {
  const [state, action, pending] = React.useActionState<NewJobState, FormData>(createJobAction, undefined);
  const [source, setSource] = React.useState<JobSource>("upwork");
  const [fee, setFee] = React.useState(String(Math.round(feeDefaults.upwork * 100)));
  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action}>
      <Card className="rounded-xl shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
        <CardContent className="grid gap-5 p-6 sm:grid-cols-6">
          {state?.error ? (
            <Alert variant="bad" className="sm:col-span-6">
              <AlertTitle>Couldn’t create the job</AlertTitle>
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <Field label="Working title" error={fe.title} className="sm:col-span-4">
            <Input name="title" placeholder="e.g. Northlight — winter concept film" required />
          </Field>
          <Field label="Source" className="sm:col-span-2">
            <NativeSelect
              name="source"
              value={source}
              onChange={(e) => {
                const s = e.target.value as JobSource;
                setSource(s);
                setFee(String(Math.round(feeDefaults[s] * 100)));
              }}
            >
              {JOB_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Raw brief" hint="Pasted verbatim — exact text is extracted from quotes" error={fe.rawBrief} className="sm:col-span-6">
            <Textarea name="rawBrief" rows={10} className="min-h-56 text-[14px] leading-relaxed" placeholder="Paste the full client brief…" required />
          </Field>
          <Field label="Client price (USD)" error={fe.budget} className="sm:col-span-2">
            <Input name="budget" type="number" min="1" step="1" inputMode="numeric" placeholder="1500" required className="tnum" />
          </Field>
          <Field label="Deadline" error={fe.deadline} className="sm:col-span-2">
            <Input name="deadline" type="date" defaultValue={defaultDeadline} required />
          </Field>
          <Field label="Source / channel fee %" hint={`${SOURCE_LABEL[source]} default`} error={fe.sourceFeePct} className="sm:col-span-2">
            <Input name="sourceFeePct" type="number" min="0" max="100" step="0.5" value={fee} onChange={(e) => setFee(e.target.value)} className="tnum" />
          </Field>
          <Field label="Client name" className="sm:col-span-3">
            <Input name="clientName" placeholder="Optional" />
          </Field>
          <Field label="Reference assets" hint="One URL or file name per line" className="sm:col-span-3">
            <Textarea name="referenceAssets" rows={2} className="min-h-9 text-[13px]" placeholder="https://… or moodboard.pdf" />
          </Field>
          <Field label="Client notes (private)" className="sm:col-span-6">
            <Textarea name="clientNotes" rows={2} className="min-h-12 text-[13px]" placeholder="Anything you know about the client, history, budget flexibility…" />
          </Field>
          <div className="flex items-center justify-between gap-3 sm:col-span-6">
            <p className="text-xs text-muted-foreground">Creating a job runs analysis and planning only. No generation happens until you approve the workflow and budget.</p>
            <Button type="submit" disabled={pending} className="h-11 rounded-lg px-5">
              {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {pending ? "Analysing…" : "Analyse & plan"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
