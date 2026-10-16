import { Bot, Check, CircleDot, ExternalLink, Hand, OctagonX, UserRound } from "lucide-react";
import type { JobBundle } from "@/lib/domain/types";
import { SOURCE_LABEL } from "@/lib/domain/types";
import type { Profitability } from "@/lib/services/economics";
import { cn, dateTime, usd } from "@/lib/utils";

type State = "done" | "current" | "waiting" | "upcoming" | "manual" | "stopped";
type Who = "agent" | "human" | "manual";
interface Stage {
  key: string;
  title: string;
  who: Who;
  gate?: boolean;
  state: State;
  detail?: string;
}

const WHO_ICON = { agent: Bot, human: UserRound, manual: ExternalLink };

export function ApprovalTimeline({ bundle, p }: { bundle: JobBundle; p: Profitability }) {
  const { job, analysis, workflow, approvals, generations } = bundle;
  const src = SOURCE_LABEL[job.source];
  const find = (kind: string) => approvals.filter((a) => a.kind === kind);
  const latest = (kind: string) => find(kind).at(-1);
  const order = ["new", "needs_review", "approved", "generating", "qa", "delivered"];
  const at = order.indexOf(job.status);
  const past = (s: string) => at > order.indexOf(s);
  const rejected = job.status === "rejected";

  const stages: Stage[] = [
    { key: "intake", title: "Brief pasted in", who: "human", state: "done", detail: dateTime(job.createdAt) },
    {
      key: "analysis",
      title: "Analysis, decision & plan",
      who: "agent",
      state: analysis ? "done" : "current",
      detail: analysis ? `${analysis.decision.replace("_", " ")} · est. ${usd(workflow?.estimatedTotalCost, { cents: true })}` : "Not run yet",
    },
  ];
  if (analysis?.rightsConcerns.length) {
    const r = latest("rights_clearance");
    stages.push({
      key: "rights",
      title: "Clear rights concerns",
      who: "human",
      gate: true,
      state: job.rightsCleared ? "done" : r?.status === "pending" ? "waiting" : rejected ? "stopped" : "upcoming",
      detail: `${analysis.rightsConcerns.length} issue${analysis.rightsConcerns.length > 1 ? "s" : ""}`,
    });
  }
  const wfApproved = workflow?.approvalStatus === "approved";
  stages.push({
    key: "approve",
    title: "Approve workflow & max budget",
    who: "human",
    gate: true,
    state: wfApproved ? "done" : rejected ? "stopped" : job.status === "needs_review" ? "waiting" : "upcoming",
    detail: wfApproved ? `Cap ${usd(workflow!.maxBudget)} · ${workflow!.approvedBy}` : workflow ? `Proposed cap ${usd(workflow.maxBudget)}` : undefined,
  });
  stages.push({ key: "contract", title: `Send proposal & accept contract on ${src}`, who: "manual", state: "manual", detail: "You, outside Studio Operator" });

  const budgetGates = find("budget_increase");
  stages.push({
    key: "production",
    title: "Produce inside the approved cap",
    who: "agent",
    state: past("generating") ? "done" : job.status === "generating" ? (budgetGates.some((a) => a.status === "pending") ? "waiting" : "current") : rejected ? "stopped" : "upcoming",
    detail: generations.length ? `${usd(p.committedSpend, { cents: true })} of ${usd(p.maxBudget)} committed` : undefined,
  });
  for (const a of budgetGates) {
    stages.push({ key: a.id, title: a.title, who: "human", gate: true, state: a.status === "pending" ? "waiting" : a.status === "approved" ? "done" : "stopped", detail: a.status === "rejected" ? "Declined" : a.amount ? usd(a.amount) : undefined });
  }
  stages.push({
    key: "qa",
    title: "QA, selects & revision notes",
    who: "human",
    state: past("qa") ? "done" : job.status === "qa" ? "current" : rejected ? "stopped" : "upcoming",
  });
  for (const a of find("workflow_change")) {
    stages.push({ key: a.id, title: "Scope change", who: "human", gate: true, state: a.status === "pending" ? "waiting" : a.status === "approved" ? "done" : "stopped", detail: a.status === "rejected" ? "Declined" : a.status === "approved" ? "Re-quote with client" : undefined });
  }
  const fd = latest("final_delivery");
  stages.push({
    key: "delivery",
    title: "Approve final delivery",
    who: "human",
    gate: true,
    state: job.status === "delivered" ? "done" : fd?.status === "pending" ? "waiting" : rejected ? "stopped" : "upcoming",
    detail: job.deliveredAt ? dateTime(job.deliveredAt) : undefined,
  });
  stages.push({ key: "handoff", title: `Deliver files on ${src}`, who: "manual", state: "manual", detail: "You, outside Studio Operator" });

  return (
    <section className="rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]" aria-label="Approval timeline">
      <div className="flex items-center justify-between border-b px-5 py-3.5">
        <h3 className="text-[13px] font-semibold">Timeline</h3>
        <span className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5"><Hand className="size-3 text-warn" /> human gate</span>
          <span className="inline-flex items-center gap-0.5"><Bot className="size-3" /> agent</span>
        </span>
      </div>
      {rejected ? (
        <div className="flex items-center gap-2 border-b bg-bad-soft px-5 py-3 text-[12px] text-bad">
          <OctagonX className="size-3.5" /> Rejected — nothing will be produced.
        </div>
      ) : null}
      <ol className="px-5 py-4">
        {stages.map((s, i) => {
          const Icon = WHO_ICON[s.who];
          const last = i === stages.length - 1;
          return (
            <li key={s.key} className="relative flex gap-3 pb-3 last:pb-0" data-stage={s.key} data-state={s.state}>
              {!last ? <span className={cn("absolute left-[9px] top-5 bottom-0 w-px", s.state === "done" ? "bg-ok/50" : "bg-border")} /> : null}
              <span
                className={cn(
                  "relative z-10 mt-0.5 grid size-[19px] shrink-0 place-items-center rounded-full border bg-card",
                  s.state === "done" && "border-ok bg-ok text-white",
                  s.state === "current" && "border-info text-info",
                  s.state === "waiting" && "border-warn bg-warn-soft text-warn",
                  s.state === "stopped" && "border-bad/40 text-bad",
                  s.state === "manual" && "border-dashed text-muted-foreground",
                )}
              >
                {s.state === "done" ? <Check className="size-3" /> : s.state === "waiting" ? <Hand className="size-2.5" /> : s.state === "current" ? <CircleDot className="size-2.5" /> : <Icon className="size-2.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className={cn("flex items-center gap-1.5 text-[12.5px]", s.state === "upcoming" || s.state === "manual" || s.state === "stopped" ? "text-muted-foreground" : "font-medium")}>
                  {s.title}
                  {s.gate ? <span className="rounded border border-warn/40 px-1 text-[9.5px] font-medium uppercase tracking-wide text-warn">approval</span> : null}
                </div>
                {s.detail ? <div className="tnum text-[11px] text-muted-foreground">{s.detail}</div> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
