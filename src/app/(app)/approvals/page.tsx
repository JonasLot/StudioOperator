import Link from "next/link";
import { ArrowUpRight, Check, Hand, ShieldCheck, X } from "lucide-react";
import { StatusPill } from "@/components/job-pipeline";
import { PageHeader } from "@/components/page-header";
import type { ApprovalKind } from "@/lib/domain/types";
import { getRepo } from "@/lib/repo";
import { cn, dateTime, usd } from "@/lib/utils";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<ApprovalKind, string> = {
  initial_workflow: "Workflow & budget",
  rights_clearance: "Rights",
  budget_increase: "Budget increase",
  workflow_change: "Scope change",
  revision: "Revision",
  final_delivery: "Final delivery",
};

export default async function ApprovalsPage() {
  const repo = getRepo();
  const jobs = new Map(repo.listJobs().map((j) => [j.id, j]));
  const all = repo.listApprovals();
  const pending = all.filter((a) => a.status === "pending");
  const byJob = [...new Set(pending.map((a) => a.jobId))].map((id) => ({ job: jobs.get(id)!, items: pending.filter((a) => a.jobId === id) }));
  const history = all
    .filter((a) => a.status !== "pending")
    .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))
    .slice(0, 12);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Workspace / Approvals"
        title={pending.length ? "A few decisions are yours." : "Nothing is waiting on you."}
        subtitle="The agent stops at every point below: rights, the initial workflow and spend ceiling, any budget increase or scope change, and final delivery."
      />

      <section className="flex flex-col gap-4" aria-label="Pending approvals">
        {byJob.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border bg-card px-6 py-6 text-[13.5px] text-muted-foreground">
            <ShieldCheck className="size-5 text-ok" strokeWidth={1.6} /> All clear. Production continues only inside the limits you have approved.
          </div>
        ) : null}
        {byJob.map(({ job, items }) => (
          <div key={job.id} className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]" data-approval-job={job.id}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="truncate text-[15px] font-semibold">{job.title}</span>
                <StatusPill status={job.status} />
              </div>
              <Link href={`/jobs/${job.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">
                Review in job <ArrowUpRight className="size-4" />
              </Link>
            </div>
            <ul className="divide-y">
              {items.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start gap-4 px-6 py-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-warn-soft">
                    <Hand className="size-4 text-warn" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium">{a.title}</span>
                      <span className="eyebrow text-[10px]">{KIND_LABEL[a.kind]}</span>
                    </span>
                    <span className="mt-1 block text-[13px] text-muted-foreground">{a.reason}</span>
                  </span>
                  <span className="tnum text-right text-[13px]">
                    {a.amount !== null ? <span className="block font-semibold">{usd(a.amount)}</span> : null}
                    <span className="text-[11.5px] text-muted-foreground">{dateTime(a.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section aria-label="Decision history">
        <h2 className="text-lg font-semibold">Recent decisions</h2>
        <div className="mt-4 overflow-hidden rounded-xl border bg-card">
          {history.length === 0 ? <p className="px-6 py-6 text-[13px] text-muted-foreground">No decisions yet.</p> : null}
          <ul className="divide-y">
            {history.map((a) => (
              <li key={a.id}>
                <Link href={`/jobs/${a.jobId}`} className="flex flex-wrap items-center gap-3 px-6 py-3 text-[13px] hover:bg-muted/30">
                  {a.status === "approved" ? <Check className="size-4 text-ok" /> : <X className="size-4 text-bad" />}
                  <span className="font-medium">{a.title}</span>
                  <span className="text-muted-foreground">{jobs.get(a.jobId)?.title}</span>
                  <span className={cn("ml-auto text-[12px]", a.status === "approved" ? "text-ok" : "text-muted-foreground")}>
                    {a.status === "approved" ? "Approved" : "Declined"} · {a.decidedBy} · {dateTime(a.decidedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
