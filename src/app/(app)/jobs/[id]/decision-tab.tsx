import { CircleHelp, ShieldAlert } from "lucide-react";
import { DecisionBadge } from "@/components/status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import type { BriefView, Job, Workflow } from "@/lib/domain/types";
import type { Profitability } from "@/lib/services/economics";
import { cn, pct } from "@/lib/utils";
import { AnalyzeButton, RejectButton, ReopenButton } from "./job-actions";
import { ListOrEmpty, Section } from "./section";

const VERDICT: Record<string, string> = {
  accept: "Take it. The brief is clear, feasible and profitable inside the plan.",
  human_review: "Worth doing, but something needs your judgement first.",
  reject: "Don’t take this on as briefed.",
};

export function DecisionTab({ job, analysis, workflow, profitability }: { job: Job; analysis: BriefView | null; workflow: Workflow | null; profitability: Profitability }) {
  if (!analysis) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed bg-card px-4 py-6">
        <p className="text-[13px] text-muted-foreground">No decision yet — the brief hasn’t been analysed.</p>
        <AnalyzeButton jobId={job.id} label="Analyse brief" />
      </div>
    );
  }
  const preApproval = !workflow || workflow.approvalStatus !== "approved";
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Recommendation</span>
              <DecisionBadge decision={analysis.decision} />
            </div>
            <p className="text-base font-medium">{VERDICT[analysis.decision]}</p>
          </div>
          <div className="w-44">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Analysis confidence</span>
              <span className="tnum">{pct(analysis.confidence)}</span>
            </div>
            <Progress value={analysis.confidence * 100} className="mt-1.5" indicatorClassName={cn(analysis.confidence < 0.55 ? "bg-bad" : analysis.confidence < 0.75 ? "bg-warn" : "bg-ok")} />
            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span>Expected margin</span>
              <span className="tnum">{pct(profitability.expectedGrossMarginPct)}</span>
            </div>
          </div>
        </div>
        <ul className="mt-3 flex flex-col gap-1.5 border-t pt-3 text-[13px]">
          {analysis.rationale.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/60" />
              {r}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          {job.status === "rejected" ? <ReopenButton jobId={job.id} /> : null}
          {preApproval && job.status !== "rejected" ? <RejectButton jobId={job.id} /> : null}
          {preApproval ? <AnalyzeButton jobId={job.id} variant="outline" /> : null}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Economics, deadline and rights checks are applied deterministically on top of the model’s read, so the recommendation can be explained line by line.
        </p>
      </section>

      {analysis.rightsConcerns.length ? (
        <Alert variant={job.rightsCleared ? "ok" : "warn"}>
          <ShieldAlert />
          <AlertTitle>{job.rightsCleared ? "Rights concerns cleared by you" : "Rights concerns — human clearance required"}</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
              {analysis.rightsConcerns.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <Section title={<span className="inline-flex items-center gap-1.5"><CircleHelp className="size-3.5" /> Missing information</span>} aside={<span className="text-[11px] text-muted-foreground">ask the client before quoting</span>}>
        <ListOrEmpty items={analysis.missingInformation} empty="Nothing missing — the brief covers what production needs." />
      </Section>
    </div>
  );
}
