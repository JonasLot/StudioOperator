"use client";

import * as React from "react";
import { Check, ExternalLink, Hand, Loader2, ShieldCheck, X } from "lucide-react";
import {
  approveBudgetIncreaseAction,
  approveDeliveryAction,
  approveWorkflowAction,
  clearRightsAction,
  decideApprovalAction,
  rejectJobAction,
} from "@/app/actions";
import { useServerAction } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApprovalRequest, BriefView, Generation, Job, Revision, Workflow } from "@/lib/domain/types";
import { SOURCE_LABEL } from "@/lib/domain/types";
import { usd } from "@/lib/utils";

function Shell({ a, children }: { a: ApprovalRequest; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t px-5 py-4 first:border-t-0" data-approval={a.kind}>
      <div>
        <div className="text-[13px] font-medium">{a.title}</div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{a.reason}</p>
      </div>
      {children}
    </div>
  );
}

function Err({ e }: { e: string | null }) {
  return e ? <p className="text-xs text-bad">{e}</p> : null;
}

function WorkflowApproval({ a, job, workflow, rightsOpen }: { a: ApprovalRequest; job: Job; workflow: Workflow | null; rightsOpen: boolean }) {
  const { pending, error, exec } = useServerAction();
  const [cap, setCap] = React.useState(String(a.amount ?? workflow?.maxBudget ?? ""));
  return (
    <Shell a={a}>
      <label className="flex items-center gap-2 text-[12px]">
        <span className="shrink-0 text-muted-foreground">Max generation budget</span>
        <span className="relative flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">$</span>
          <Input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" className="tnum h-8 pl-5 text-[13px]" aria-label="Maximum generation budget" name="maxBudget" />
        </span>
      </label>
      {workflow ? (
        <p className="tnum text-[11px] text-muted-foreground">
          Plan estimate {usd(workflow.estimatedTotalCost, { cents: true })} · client price {usd(job.budget)}
        </p>
      ) : null}
      {rightsOpen ? <p className="text-xs text-warn">Clear the rights concerns above first.</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="approve" disabled={pending || rightsOpen} onClick={() => exec(() => approveWorkflowAction(job.id, Number(cap)))}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Approve plan & cap
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Reject this job? Decline it on the marketplace yourself.")) exec(() => rejectJobAction(job.id, "Declined at plan review."));
          }}
        >
          <X /> Reject job
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">After approval the agent may run steps only while spend stays under this cap.</p>
      <Err e={error} />
    </Shell>
  );
}

function RightsApproval({ a, job, analysis }: { a: ApprovalRequest; job: Job; analysis: BriefView | null }) {
  const { pending, error, exec } = useServerAction();
  const [note, setNote] = React.useState("");
  const [ack, setAck] = React.useState(false);
  return (
    <Shell a={{ ...a, reason: "" }}>
      <ul className="-mt-1 flex list-disc flex-col gap-1 pl-4 text-[12px] text-muted-foreground">
        {(analysis?.rightsConcerns ?? [a.reason]).map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="How it was resolved (e.g. client confirmed library music)" className="h-8 text-[12.5px]" />
      <label className="flex items-start gap-2 text-[12px]">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
        I’ve resolved these with the client or will avoid them in production.
      </label>
      <Button size="sm" variant="approve" className="w-fit" disabled={pending || !ack} onClick={() => exec(() => clearRightsAction(job.id, a.id, note))}>
        {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Mark rights cleared
      </Button>
      <Err e={error} />
    </Shell>
  );
}

function BudgetApproval({ a, job, workflow }: { a: ApprovalRequest; job: Job; workflow: Workflow | null }) {
  const { pending, error, exec } = useServerAction();
  const [cap, setCap] = React.useState(String(a.amount ?? ""));
  return (
    <Shell a={a}>
      <label className="flex items-center gap-2 text-[12px]">
        <span className="shrink-0 text-muted-foreground">New cap (now {usd(workflow?.maxBudget)})</span>
        <Input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" className="tnum h-8 flex-1 text-[13px]" aria-label="New cap" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="approve" disabled={pending} onClick={() => exec(() => approveBudgetIncreaseAction(job.id, a.id, Number(cap)))}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Raise cap
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => exec(() => decideApprovalAction(job.id, a.id, "rejected"))}>
          Decline
        </Button>
      </div>
      <Err e={error} />
    </Shell>
  );
}

function ScopeApproval({ a, job }: { a: ApprovalRequest; job: Job }) {
  const { pending, error, exec } = useServerAction();
  return (
    <Shell a={a}>
      <p className="text-[11px] text-muted-foreground">Approving records that you’ll re-quote this with the client on {SOURCE_LABEL[job.source]}; it is not produced inside the current budget.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => exec(() => decideApprovalAction(job.id, a.id, "approved"))}>
          <Check /> Accept & re-quote
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => exec(() => decideApprovalAction(job.id, a.id, "rejected"))}>
          <X /> Decline change
        </Button>
      </div>
      <Err e={error} />
    </Shell>
  );
}

function DeliveryApproval({ a, job, generations, blocked }: { a: ApprovalRequest; job: Job; generations: Generation[]; blocked: number }) {
  const { pending, error, exec } = useServerAction();
  const [ack, setAck] = React.useState(false);
  const selected = generations.filter((g) => g.selected).length;
  return (
    <Shell a={a}>
      <p className="tnum text-[12px]">{selected} outputs selected for delivery.</p>
      <label className="flex items-start gap-2 text-[12px]">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" name="deliveryAck" />
        <span>
          I reviewed the selected outputs and will deliver them to the client on <b>{SOURCE_LABEL[job.source]}</b> myself.
          <ExternalLink className="ml-1 inline size-3 text-muted-foreground" />
        </span>
      </label>
      {blocked ? <p className="text-xs text-warn">Resolve {blocked} other pending approval{blocked > 1 ? "s" : ""} first.</p> : null}
      <Button
        size="sm"
        variant="approve"
        className="w-fit"
        disabled={pending || !ack || blocked > 0}
        onClick={() => exec(() => approveDeliveryAction(job.id, `Operator attests manual delivery via ${SOURCE_LABEL[job.source]}.`))}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Check />} Approve final delivery
      </Button>
      <Err e={error} />
    </Shell>
  );
}

export function PendingApprovals({
  job,
  approvals,
  analysis,
  workflow,
  generations,
}: {
  job: Job;
  approvals: ApprovalRequest[];
  analysis: BriefView | null;
  workflow: Workflow | null;
  generations: Generation[];
  revisions: Revision[];
}) {
  if (approvals.length === 0) return null;
  const rightsOpen = approvals.some((a) => a.kind === "rights_clearance");
  const order = ["rights_clearance", "initial_workflow", "budget_increase", "workflow_change", "revision", "final_delivery"];
  const sorted = [...approvals].sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind));
  return (
    <section className="overflow-hidden rounded-xl border border-warn/30 bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]" aria-label="Approvals waiting on you" id="approvals">
      <div className="flex items-center gap-2 bg-warn-soft px-5 py-3.5 text-[13px] font-semibold">
        <Hand className="size-4 text-warn" /> Waiting on you
      </div>
      {sorted.map((a) => {
        switch (a.kind) {
          case "initial_workflow":
            return <WorkflowApproval key={a.id} a={a} job={job} workflow={workflow} rightsOpen={rightsOpen} />;
          case "rights_clearance":
            return <RightsApproval key={a.id} a={a} job={job} analysis={analysis} />;
          case "budget_increase":
            return <BudgetApproval key={a.id} a={a} job={job} workflow={workflow} />;
          case "final_delivery":
            return <DeliveryApproval key={a.id} a={a} job={job} generations={generations} blocked={approvals.length - 1} />;
          default:
            return <ScopeApproval key={a.id} a={a} job={job} />;
        }
      })}
    </section>
  );
}
