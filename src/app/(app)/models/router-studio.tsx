"use client";

import * as React from "react";
import { AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { routerModel } from "@/lib/router/catalog";
import { priceRoute, proposeRoute, type RouteInput, type StageSelection } from "@/lib/router/route";
import { cn, usd } from "@/lib/utils";

const ROLE_CHIP: Record<string, string> = {
  search: "bg-info-soft text-info",
  control: "bg-warn-soft text-warn",
  ship: "bg-brand-soft text-brand",
  finish: "bg-ok-soft text-ok",
};

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--brand)]" />
      {label}
    </label>
  );
}

export function RouterStudio() {
  const [input, setInput] = React.useState<RouteInput>({
    medium: "video", needsIdentity: true, needsText: true, talking: false,
    resolution: "4K", durationSec: 60, deadlineDays: 14,
    conceptCount: 8, keep: 2, clientPrice: 4800, sourceFeePct: 0.1, contingencyPct: 0.2, targetMarginPct: 0.45,
  });
  const [overrides, setOverrides] = React.useState<Record<number, { selectedId?: string; attempts?: number }>>({});
  const set = <K extends keyof RouteInput>(k: K, v: RouteInput[K]) => { setInput((p) => ({ ...p, [k]: v })); setOverrides({}); };

  const plan = React.useMemo(() => proposeRoute(input), [input]);
  const selections: StageSelection[] = plan.stages.map((s, i) => ({
    key: s.key, role: s.role, title: s.title, why: s.why, optional: s.optional, candidateIds: s.candidateIds,
    selectedId: overrides[i]?.selectedId ?? s.selectedId,
    estimatedAttempts: overrides[i]?.attempts ?? s.estimatedAttempts,
  }));
  const eco = React.useMemo(() => priceRoute(selections, input), [selections, input]);
  const marginPct = Math.round(eco.expectedMarginPct * 100);

  return (
    <div className="flex flex-col gap-6">
      {/* Brief signals */}
      <section className="rounded-xl border bg-card p-4">
        <h3 className="text-[14px] font-semibold">Brief signals the route is based on</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label>Deliverable</Label>
            <NativeSelect value={input.medium} onChange={(e) => set("medium", e.target.value as RouteInput["medium"])}>
              <option value="video">Video</option>
              <option value="image">Image / stills</option>
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5"><Label>Resolution</Label><Input value={input.resolution ?? ""} onChange={(e) => set("resolution", e.target.value || null)} /></div>
          <div className="flex flex-col gap-1.5"><Label>Duration (s)</Label><Input type="number" value={input.durationSec ?? 0} onChange={(e) => set("durationSec", Number(e.target.value) || null)} /></div>
          <div className="flex flex-col gap-1.5"><Label>Deadline (days)</Label><Input type="number" value={input.deadlineDays} onChange={(e) => set("deadlineDays", Number(e.target.value) || 0)} /></div>
          <div className="flex flex-col gap-1.5"><Label>Concepts to explore</Label><Input type="number" value={input.conceptCount} onChange={(e) => set("conceptCount", Math.max(1, Number(e.target.value) || 1))} /></div>
          <div className="flex flex-col gap-1.5"><Label>Concepts kept</Label><Input type="number" value={input.keep} onChange={(e) => set("keep", Math.max(1, Number(e.target.value) || 1))} /></div>
          <div className="flex flex-col gap-1.5"><Label>Client price</Label><Input type="number" value={input.clientPrice} onChange={(e) => set("clientPrice", Number(e.target.value) || 0)} /></div>
          <div className="flex flex-col gap-1.5"><Label>Target margin</Label><Input type="number" step="0.05" value={input.targetMarginPct} onChange={(e) => set("targetMarginPct", Number(e.target.value) || 0)} /></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-5 border-t pt-3">
          <Toggle label="Reference / identity to preserve" checked={input.needsIdentity} onChange={(v) => set("needsIdentity", v)} />
          <Toggle label="Exact text / packaging" checked={input.needsText} onChange={(v) => set("needsText", v)} />
          <Toggle label="Talking / native audio" checked={input.talking} onChange={(v) => set("talking", v)} />
        </div>
      </section>

      {/* Pipeline */}
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
        {plan.pipeline.map((p, i) => (
          <span key={i} className="flex items-center gap-2">
            <span className="rounded-md bg-muted px-2 py-1">{p}</span>
            {i < plan.pipeline.length - 1 ? <ArrowRight className="size-3" /> : null}
          </span>
        ))}
      </div>

      {/* Approval gate */}
      <div className="flex items-start gap-2 rounded-xl border border-dashed bg-warn-soft/40 px-4 py-3 text-[13px]">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-warn" />
        <p>This is a <strong>proposal</strong>. Nothing runs until a human approves the initial paid workflow and the maximum spend below. After approval the agent may operate only inside those limits.</p>
      </div>

      {/* Stage cards */}
      <div className="flex flex-col gap-3">
        {eco.stages.map((s, i) => (
          <section key={i} className={cn("rounded-xl border bg-card p-4", s.optional && "border-dashed")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={cn("rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide", ROLE_CHIP[s.role])}>{s.role}</span>
                <span className="text-[14.5px] font-medium">{i + 1}. {s.title}</span>
                {s.optional ? <Badge variant="outline">optional</Badge> : null}
              </div>
              <div className="tnum text-[13px] text-muted-foreground">max authorized <span className="font-semibold text-foreground">{usd(s.maxAuthorizedSpend, { cents: true })}</span></div>
            </div>
            <p className="mt-2 text-[13px] text-muted-foreground">{s.why}</p>

            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Label className="w-24 shrink-0">Model</Label>
                  <NativeSelect value={s.model.id} onChange={(e) => setOverrides((p) => ({ ...p, [i]: { ...p[i], selectedId: e.target.value } }))}>
                    {s.candidateIds.map((id) => { const m = routerModel(id); return <option key={id} value={id}>{m?.label ?? id}{m && !m.listed ? " — not in catalog" : ""}</option>; })}
                  </NativeSelect>
                </div>
                <p className="text-[12.5px]"><span className="text-muted-foreground">Why it fits: </span>{s.model.strengths}. <span className="text-muted-foreground">Speed:</span> {s.model.speed} · {s.model.typicalQueue}.</p>
                <p className="flex items-start gap-1.5 text-[12.5px] text-muted-foreground"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" /> Known failure mode: {s.model.failureMode}</p>
                <p className="text-[12.5px] text-muted-foreground">Alternative: {s.alternative ? `${s.alternative.label} (${usd(s.alternative.costPerAttemptUsd, { cents: true })}/attempt)` : "—"}</p>
                {!s.model.listed ? <p className="text-[11.5px] text-warn">⚠ Not in Higgsfield&apos;s live model list — confirm before any paid run.</p> : <p className="text-[11.5px] text-ok">✓ In Higgsfield&apos;s live model list ({s.model.jobType}). {s.model.providerModelId ? "Linked to a provider endpoint." : "Not yet linked to a provider endpoint, so the app cannot run it yet."}</p>}
              </div>
              <div className="flex flex-col justify-center gap-1.5 rounded-lg border bg-muted/40 p-3 text-[13px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Attempts</span>
                  <Input type="number" className="h-7 w-20 text-right" value={s.estimatedAttempts} onChange={(e) => setOverrides((p) => ({ ...p, [i]: { ...p[i], attempts: Math.max(0, Number(e.target.value) || 0) } }))} />
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cost / attempt</span><span className="tnum">{usd(s.costPerAttemptUsd, { cents: true })}</span></div>
                <div className="flex justify-between border-t pt-1.5 font-medium"><span>Stage cost</span><span className="tnum">{usd(s.stageCost, { cents: true })}</span></div>
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* Economics */}
      <section className="rounded-xl border bg-card p-4">
        <h3 className="text-[14px] font-semibold">Economics (recalculated instantly on any override)</h3>
        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-5">
          {[
            ["Estimated spend", usd(eco.estimatedSpend, { cents: true })],
            [`Max authorized (+${Math.round(eco.contingencyPct * 100)}%)`, usd(eco.maxAuthorizedSpend, { cents: true })],
            ["Net revenue", usd(eco.netRevenue, { cents: true })],
            ["Expected margin", `${usd(eco.expectedMargin, { cents: true })} · ${marginPct}%`],
            ["Target margin", `${Math.round(eco.targetMarginPct * 100)}%`],
          ].map(([k, v]) => (
            <div key={k} className="bg-card px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</div>
              <div className="tnum mt-0.5 text-[15px] font-semibold">{v}</div>
            </div>
          ))}
        </div>
        <p className={cn("mt-3 text-[13px]", eco.meetsTarget ? "text-ok" : "text-warn")}>
          {eco.meetsTarget
            ? `Worst-case spend keeps margin at ${marginPct}%, at or above the ${Math.round(eco.targetMarginPct * 100)}% target — safe to put up for approval.`
            : `Worst-case margin ${marginPct}% is under the ${Math.round(eco.targetMarginPct * 100)}% target — trim attempts, pick cheaper lanes, or reprice before approval.`}
        </p>
      </section>
    </div>
  );
}
