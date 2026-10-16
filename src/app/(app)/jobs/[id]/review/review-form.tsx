"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, X } from "lucide-react";
import { reviewIntakeAction } from "@/app/actions";
import { useServerAction } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  CAPABILITIES,
  CONSENT_FLAG_KINDS,
  REVISION_RISKS,
  type Analysis,
  type Capability,
  type ConsentFlagKind,
} from "@/lib/analysis/schema";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const text = (xs: string[]) => xs.join("\n");

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>
        {label}
        {hint ? <span className="ml-2 font-normal text-muted-foreground">{hint}</span> : null}
      </Label>
      {children}
    </div>
  );
}

function ListField({ label, hint, value, onChange }: { label: string; hint?: string; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <Field label={label} hint={hint ?? "one per line"}>
      <Textarea rows={Math.max(2, value.length + 1)} defaultValue={text(value)} onChange={(e) => onChange(lines(e.target.value))} />
    </Field>
  );
}

export function ReviewForm({ jobId, initial, locked }: { jobId: string; initial: Analysis; locked: boolean }) {
  const [a, setA] = React.useState<Analysis>(initial);
  const { pending, error, exec } = useServerAction();
  const router = useRouter();
  const set = <K extends keyof Analysis>(k: K, v: Analysis[K]) => setA((prev) => ({ ...prev, [k]: v }));

  const submit = (action: "save" | "approve" | "reject") => {
    if (action === "reject" && !window.confirm("Reject this job? Decline it on the marketplace yourself too.")) return;
    exec(
      () => reviewIntakeAction(jobId, a, action),
      () => router.refresh(),
    );
  };

  // deliverables helpers
  const updDel = (i: number, patch: Partial<Analysis["deliverables"][number]>) =>
    set("deliverables", a.deliverables.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const addDel = () =>
    set("deliverables", [...a.deliverables, { name: "", format: "video", aspectRatio: null, duration: null, resolution: null, exactTextRequirements: [] }]);
  const delDel = (i: number) => set("deliverables", a.deliverables.filter((_, j) => j !== i));

  // flags helpers
  const updFlag = (i: number, patch: Partial<Analysis["rightsAndConsentFlags"][number]>) =>
    set("rightsAndConsentFlags", a.rightsAndConsentFlags.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const addFlag = () => set("rightsAndConsentFlags", [...a.rightsAndConsentFlags, { kind: "unclear_rights", detail: "" }]);
  const delFlag = (i: number) => set("rightsAndConsentFlags", a.rightsAndConsentFlags.filter((_, j) => j !== i));

  // workflow helpers (keep estimatedAttemptsByStep aligned)
  const updStep = (i: number, patch: Partial<Analysis["proposedWorkflow"][number]>) =>
    set("proposedWorkflow", a.proposedWorkflow.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const updAttempts = (i: number, n: number) =>
    set("estimatedAttemptsByStep", a.estimatedAttemptsByStep.map((x, j) => (j === i ? n : x)));
  const addStep = () =>
    setA((prev) => ({ ...prev, proposedWorkflow: [...prev.proposedWorkflow, { capability: "image_keyframes", description: "" }], estimatedAttemptsByStep: [...prev.estimatedAttemptsByStep, 4] }));
  const delStep = (i: number) =>
    setA((prev) => ({ ...prev, proposedWorkflow: prev.proposedWorkflow.filter((_, j) => j !== i), estimatedAttemptsByStep: prev.estimatedAttemptsByStep.filter((_, j) => j !== i) }));

  const box = "rounded-lg border bg-card p-3 flex flex-col gap-2";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job type"><Input value={a.jobType} onChange={(e) => set("jobType", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Confidence" hint="0–100">
            <Input type="number" min={0} max={100} value={a.confidence} onChange={(e) => set("confidence", Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
          </Field>
          <Field label="Revision risk">
            <NativeSelect value={a.revisionRisk} onChange={(e) => set("revisionRisk", e.target.value as Analysis["revisionRisk"])}>
              {REVISION_RISKS.map((r) => <option key={r} value={r}>{r}</option>)}
            </NativeSelect>
          </Field>
        </div>
      </div>

      <Field label="Concise summary"><Textarea rows={3} value={a.conciseSummary} onChange={(e) => set("conciseSummary", e.target.value)} /></Field>

      {/* deliverables */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Deliverables</Label>
          <Button type="button" size="xs" variant="outline" onClick={addDel}><Plus /> Add</Button>
        </div>
        {a.deliverables.length === 0 ? <p className="text-[13px] text-muted-foreground">No deliverables extracted.</p> : null}
        {a.deliverables.map((d, i) => (
          <div key={i} className={box}>
            <div className="flex items-center gap-2">
              <Input className="flex-1" placeholder="Name" value={d.name} onChange={(e) => updDel(i, { name: e.target.value })} />
              <Input className="w-36" placeholder="Format" value={d.format} onChange={(e) => updDel(i, { format: e.target.value })} />
              <Button type="button" size="icon" variant="ghost" onClick={() => delDel(i)}><Trash2 /></Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="Aspect ratio" value={d.aspectRatio ?? ""} onChange={(e) => updDel(i, { aspectRatio: e.target.value || null })} />
              <Input placeholder="Duration" value={d.duration ?? ""} onChange={(e) => updDel(i, { duration: e.target.value || null })} />
              <Input placeholder="Resolution" value={d.resolution ?? ""} onChange={(e) => updDel(i, { resolution: e.target.value || null })} />
            </div>
            <Textarea rows={2} placeholder="Exact text requirements (one per line)" defaultValue={text(d.exactTextRequirements)} onChange={(e) => updDel(i, { exactTextRequirements: lines(e.target.value) })} />
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ListField label="Supplied assets" value={a.suppliedAssets} onChange={(v) => set("suppliedAssets", v)} />
        <ListField label="Missing assets" value={a.missingAssets} onChange={(v) => set("missingAssets", v)} />
        <ListField label="Questions for client" value={a.questionsForClient} onChange={(v) => set("questionsForClient", v)} />
        <ListField label="Brand constraints" value={a.brandConstraints} onChange={(v) => set("brandConstraints", v)} />
        <ListField label="Technical risks" value={a.technicalRisks} onChange={(v) => set("technicalRisks", v)} />
        <ListField label="Assumptions" value={a.assumptions} onChange={(v) => set("assumptions", v)} />
      </div>

      {/* rights & consent flags */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Rights & consent flags</Label>
          <Button type="button" size="xs" variant="outline" onClick={addFlag}><Plus /> Add</Button>
        </div>
        {a.rightsAndConsentFlags.length === 0 ? <p className="text-[13px] text-muted-foreground">No flags.</p> : null}
        {a.rightsAndConsentFlags.map((f, i) => (
          <div key={i} className="flex items-center gap-2">
            <NativeSelect className="w-48" value={f.kind} onChange={(e) => updFlag(i, { kind: e.target.value as ConsentFlagKind })}>
              {CONSENT_FLAG_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </NativeSelect>
            <Input className="flex-1" placeholder="Detail" value={f.detail} onChange={(e) => updFlag(i, { detail: e.target.value })} />
            <Button type="button" size="icon" variant="ghost" onClick={() => delFlag(i)}><Trash2 /></Button>
          </div>
        ))}
      </div>

      {/* proposed workflow */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Proposed workflow <span className="ml-2 font-normal text-muted-foreground">by capability — the app prices it</span></Label>
          <Button type="button" size="xs" variant="outline" onClick={addStep}><Plus /> Add</Button>
        </div>
        {a.proposedWorkflow.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <NativeSelect className="w-52" value={s.capability} onChange={(e) => updStep(i, { capability: e.target.value as Capability })}>
              {CAPABILITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </NativeSelect>
            <Input className="flex-1" placeholder="Description" value={s.description} onChange={(e) => updStep(i, { description: e.target.value })} />
            <Input className="w-24" type="number" min={0} title="Estimated attempts" value={a.estimatedAttemptsByStep[i] ?? 0} onChange={(e) => updAttempts(i, Math.max(0, Number(e.target.value) || 0))} />
            <Button type="button" size="icon" variant="ghost" onClick={() => delStep(i)}><Trash2 /></Button>
          </div>
        ))}
      </div>

      {error ? <p className="text-[13px] text-bad">{error}</p> : null}
      {locked ? (
        <p className="text-[13px] text-muted-foreground">This job already moved past review; edits are disabled.</p>
      ) : (
        <div className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-background/90 py-3 backdrop-blur">
          <Button disabled={pending} onClick={() => submit("approve")}><Check /> Save & approve</Button>
          <Button variant="outline" disabled={pending} onClick={() => submit("save")}>Save edits</Button>
          <Button variant="outline" disabled={pending} onClick={() => submit("reject")}><X /> Reject job</Button>
          {pending ? <Badge variant="secondary">Saving…</Badge> : null}
        </div>
      )}
    </div>
  );
}
