import Link from "next/link";
import { ArrowRight, BadgeCheck, CircleDashed } from "lucide-react";
import { ApprovalBadge, StepStatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import type { Generation, Job, Workflow } from "@/lib/domain/types";
import { CATEGORY_LABEL } from "@/lib/domain/types";
import { config } from "@/lib/config";
import { MODEL_CATALOG, getModel } from "@/lib/higgsfield/catalog";
import { dateTime, usd } from "@/lib/utils";
import { ApproveStepOutputButton, RemoveStepButton, RetryStepButton, StartProductionButton } from "./job-actions";
import { AddStep } from "./step-add";
import { stepAwaitingReview } from "@/lib/services/review-gate";
import { StepEditor } from "./step-editor";

export function WorkflowTab({ job, workflow, generations }: { job: Job; workflow: Workflow | null; generations: Generation[] }) {
  if (!workflow) return <p className="rounded-xl border border-dashed bg-card px-4 py-6 text-[13px] text-muted-foreground">No production plan yet. Analyse the brief first.</p>;
  const editable = !["superseded", "rejected"].includes(workflow.approvalStatus) && !["rejected", "delivered"].includes(job.status);
  const lastStarted = workflow.steps.filter((x) => x.status !== "pending").reduce((a, x) => Math.max(a, x.order), 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
          <span className="font-medium">Plan v{workflow.version}</span>
          <ApprovalBadge a={{ status: workflow.approvalStatus }} />
          <span className="text-muted-foreground">
            Estimate <span className="tnum text-foreground">{usd(workflow.estimatedTotalCost, { cents: true })}</span>
          </span>
          <span className="text-muted-foreground">
            Cap <span className="tnum text-foreground">{usd(workflow.maxBudget)}</span>
          </span>
          {workflow.approvedAt ? <span className="text-muted-foreground">Approved {dateTime(workflow.approvedAt)} by {workflow.approvedBy}</span> : null}
        </div>
        {job.status === "approved" ? <StartProductionButton jobId={job.id} /> : null}
      </div>

      <ol className="flex flex-col gap-2">
        {workflow.steps.map((s) => {
          const m = getModel(s.modelId);
          const sg = generations.filter((g) => g.stepId === s.id && !g.revisionId);
          const done = sg.filter((g) => g.status === "completed").length;
          const canEdit = editable && ["pending", "failed", "blocked"].includes(s.status);
          const nextStep = workflow.steps.find((x) => x.order > s.order && x.status === "pending");
          const awaiting = job.status === "generating" && nextStep && stepAwaitingReview(workflow, generations, nextStep)?.id === s.id;
          const prev = workflow.steps.find((x) => x.order === s.order - 1);
          return (
            <li key={s.id} className="rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]" data-step={s.order}>
              <div className="flex flex-wrap items-start gap-3 px-4 py-3">
                <span className="tnum mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-medium">{s.order}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold">{s.name}</span>
                    <Badge variant="secondary">{CATEGORY_LABEL[s.category]}</Badge>
                    <StepStatusBadge status={s.status} />
                    {sg.length ? <span className="tnum text-[11px] text-muted-foreground">{done}/{sg.length} usable</span> : null}
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{s.purpose}</p>
                  <div className="mt-2 grid gap-2 text-[12.5px] md:grid-cols-[1fr_auto_1fr]">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Inputs</div>
                      <ul className="mt-0.5">{s.inputs.map((x, i) => <li key={i} className="truncate" title={x}>{x}</li>)}</ul>
                      {prev ? <p className="mt-1 text-[11.5px] text-muted-foreground">Also receives the picked output of step {prev.order} “{prev.name}” once it is done.</p> : null}
                    </div>
                    <ArrowRight className="mt-4 hidden size-3.5 text-muted-foreground md:block" />
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Expected outputs</div>
                      <ul className="mt-0.5">{s.expectedOutputs.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    </div>
                  </div>
                </div>
                <div className="tnum flex w-full flex-col gap-0.5 text-right text-[12.5px] sm:w-56">
                  <span className="inline-flex items-center justify-end gap-1 font-medium" title={m.verified ? "Endpoint verified against Higgsfield docs" : "Endpoint path to confirm before live use"}>
                    {m.verified ? <BadgeCheck className="size-3.5 text-ok" /> : <CircleDashed className="size-3.5 text-muted-foreground" />}
                    {m.label}
                  </span>
                  <span className="text-muted-foreground">
                    {s.estimatedAttempts} attempts × {usd(s.unitCost, { cents: true })} <span className="text-[11px]">{m.unitLabel}</span>
                  </span>
                  <span className="font-semibold">{usd(s.estimatedTotalCost, { cents: true })}</span>
                  {s.status === "failed" ? <span className="mt-1 self-end"><RetryStepButton jobId={job.id} stepId={s.id} /></span> : null}
                </div>
              </div>
              {awaiting ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/40 px-4 py-2 text-[12.5px]">
                  <span>
                    Waiting for you: approve a take of this step before “{nextStep!.name}” starts.{" "}
                    <Link href={`/jobs/${job.id}?tab=outputs`} className="underline underline-offset-2">Review takes</Link>
                  </span>
                  <ApproveStepOutputButton jobId={job.id} stepId={s.id} />
                </div>
              ) : null}
              {canEdit ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
                  <StepEditor
                    jobId={job.id}
                    step={{ id: s.id, name: s.name, category: s.category, purpose: s.purpose, inputs: s.inputs, expectedOutputs: s.expectedOutputs, modelId: s.modelId, status: s.status, unitCost: s.unitCost, estimatedAttempts: s.estimatedAttempts }}
                    models={MODEL_CATALOG.filter((x) => x.category === s.category).map((x) => ({ id: x.id, label: x.label, unitCostUsd: x.unitCostUsd, unitLabel: x.unitLabel, verified: x.verified }))}
                    maxAttempts={config.economics.maxAttemptsPerStep}
                  />
                  {s.status === "pending" && workflow.steps.length > 1 ? <RemoveStepButton jobId={job.id} stepId={s.id} /> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {editable ? (
        <AddStep
          jobId={job.id}
          positions={[
            ...(workflow.steps.some((x) => x.status !== "pending") ? [] : [{ afterOrder: 0, label: "First" }]),
            ...workflow.steps.map((x) => ({ afterOrder: x.order, label: `Step ${x.order} · ${x.name}` })).filter((p) => p.afterOrder >= lastStarted),
          ]}
          models={MODEL_CATALOG.map((x) => ({ id: x.id, label: x.label, unitCostUsd: x.unitCostUsd, unitLabel: x.unitLabel, verified: x.verified, categoryLabel: CATEGORY_LABEL[x.category] }))}
          maxAttempts={config.economics.maxAttemptsPerStep}
        />
      ) : null}
      <p className="text-xs text-muted-foreground">
        Steps run in order; each feeds the next, and a finished step hands on only the take you approve. The agent submits a step only if committed spend plus the step’s estimate fits under the approved cap — otherwise it pauses and asks you.
      </p>
    </div>
  );
}
