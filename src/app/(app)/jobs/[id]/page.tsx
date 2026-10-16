import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, FileText, Gavel, Images, ListOrdered, MessageSquareDiff, Receipt } from "lucide-react";
import { ProductionPoller } from "@/components/poller";
import { StatusPill } from "@/components/job-pipeline";
import { publicConfig } from "@/lib/config";
import { SOURCE_LABEL } from "@/lib/domain/types";
import { ensureSeeded } from "@/lib/seed";
import { getBundle, profitabilityFor } from "@/lib/services/studio";
import { daysUntil, shortDate, usd } from "@/lib/utils";
import { ActivityLog } from "./activity-log";
import { ApprovalTimeline } from "./approval-timeline";
import { PrimaryAction } from "./primary-action";
import { BriefTab } from "./brief-tab";
import { CostsTab } from "./costs-tab";
import { DecisionTab } from "./decision-tab";
import { JobTabs } from "./job-tabs";
import { OutputsTab } from "./outputs-tab";
import { PendingApprovals } from "./pending-approvals";
import { ProfitabilityPanel } from "./profitability-panel";
import { RevisionsTab } from "./revisions-tab";
import { WorkflowTab } from "./workflow-tab";
import { loadRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

const TABS = ["brief", "decision", "workflow", "costs", "outputs", "revisions"] as const;

export default async function JobPage(props: PageProps<"/jobs/[id]">) {
  await loadRuntimeConfig();
  await ensureSeeded();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const bundle = await getBundle(id);
  if (!bundle) notFound();
  const { job, analysis, intake, workflow, generations, revisions, approvals } = bundle;
  const p = profitabilityFor(bundle);
  const cfg = publicConfig();
  const pending = approvals.filter((a) => a.status === "pending");
  const active = generations.some((g) => g.status === "queued" || g.status === "in_progress") || job.status === "generating";
  const d = daysUntil(job.deadline);
  const requested = typeof sp.tab === "string" && (TABS as readonly string[]).includes(sp.tab) ? sp.tab : null;
  const defaultTab = requested ?? (job.status === "qa" ? "outputs" : job.status === "generating" ? "outputs" : job.status === "new" ? "brief" : "decision");
  const completed = generations.filter((g) => g.status === "completed").length;

  return (
    <div className="flex flex-col gap-7">
      <ProductionPoller jobId={job.id} active={active} />
      <Link href="/jobs" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> All jobs
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="eyebrow">
            {SOURCE_LABEL[job.source]} <span className="mx-1.5 text-muted-foreground/50">/</span> {job.clientName ?? "Unnamed client"}
          </p>
          <h1 className="mt-3 text-[30px] font-semibold leading-[1.12] tracking-[-0.03em] sm:text-[36px]">{job.title}</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            {analysis
              ? `Brief analysed by ${analysis.analyzer}${cfg.mockMode ? " · mock mode, no API keys used" : ""}`
              : "Not analysed yet — run analysis to plan and price it."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
            <StatusPill status={job.status} />
            <span className="inline-flex items-center gap-1.5 px-1.5">
              <Clock className="size-3.5" strokeWidth={1.7} /> Due {shortDate(job.deadline)}
              {!["delivered", "rejected"].includes(job.status) ? <span className={d <= 2 ? "text-bad" : ""}>· {d}d</span> : null}
            </span>
            <span className="tnum px-1.5">{usd(job.budget, { cents: true })} client price</span>
            <span className="rounded-md bg-muted px-2 py-1">{cfg.mockMode ? "Mock mode" : "Live mode"}</span>
            {pending.length ? (
              <a href="#approvals" className="rounded-md bg-warn-soft px-2 py-1 font-medium text-warn">
                {pending.length} waiting on you
              </a>
            ) : null}
            {intake ? (
              <Link href={`/jobs/${job.id}/review`} className="rounded-md bg-accent px-2 py-1 font-medium text-accent-foreground hover:bg-accent/80">
                Review analysis →
              </Link>
            ) : null}
          </div>
        </div>
        <PrimaryAction jobId={job.id} status={job.status} hasAnalysis={!!analysis} />
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <JobTabs
            defaultValue={defaultTab}
            tabs={[
              { value: "brief", label: "Brief", icon: <FileText />, content: <BriefTab job={job} analysis={analysis} /> },
              { value: "decision", label: "Decision", icon: <Gavel />, content: <DecisionTab job={job} analysis={analysis} workflow={workflow} profitability={p} /> },
              { value: "workflow", label: "Workflow", icon: <ListOrdered />, count: workflow?.steps.length, content: <WorkflowTab job={job} workflow={workflow} generations={generations} /> },
              { value: "costs", label: "Costs", icon: <Receipt />, content: <CostsTab jobId={job.id} workflow={workflow} generations={generations} revisions={revisions} profitability={p} /> },
              { value: "outputs", label: "Outputs", icon: <Images />, count: completed || undefined, content: <OutputsTab job={job} workflow={workflow} generations={generations} revisions={revisions} /> },
              { value: "revisions", label: "Revisions", icon: <MessageSquareDiff />, count: revisions.length || undefined, content: <RevisionsTab job={job} analysis={analysis} revisions={revisions} profitability={p} generations={generations} /> },
            ]}
          />
        </div>
        <aside className="flex flex-col gap-5 lg:pt-14">
          <PendingApprovals job={job} approvals={pending} analysis={analysis} workflow={workflow} generations={generations} revisions={revisions} />
          <ProfitabilityPanel job={job} p={p} locked={workflow?.approvalStatus === "approved"} />
          <ApprovalTimeline bundle={bundle} p={p} />
          <ActivityLog events={bundle.activity} />
        </aside>
      </div>
    </div>
  );
}
