import Link from "next/link";
import { ArrowRight, ArrowUpRight, FolderOpen, Plus, ShieldCheck, Wallet } from "lucide-react";
import { JobPipeline } from "@/components/job-pipeline";
import { ProductionPoller } from "@/components/poller";
import { Button } from "@/components/ui/button";
import { JOB_STATUSES, type JobStatus } from "@/lib/domain/types";
import { getDashboard } from "@/lib/services/studio";
import { cn, usd } from "@/lib/utils";
import { loadRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

export default async function OverviewPage(props: PageProps<"/">) {
  await loadRuntimeConfig();
  const sp = await props.searchParams;
  const status = typeof sp.status === "string" && (JOB_STATUSES as readonly string[]).includes(sp.status) ? (sp.status as JobStatus) : null;
  const q = typeof sp.q === "string" ? sp.q : "";

  const rows = await getDashboard();
  const active = rows.filter((r) => !["delivered", "rejected"].includes(r.job.status));
  const priced = active.filter((r) => r.stepCount > 0);
  const waiting = rows.reduce((a, r) => a + r.pendingApprovals.length, 0);
  const waitingJobs = rows.filter((r) => r.pendingApprovals.length).length;
  const ready = rows.filter((r) => r.job.status === "approved").length;
  const generating = rows.some((r) => r.job.status === "generating");
  const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const kpis = [
    { label: "Active jobs", value: String(active.length), sub: `${ready} ready for production`, icon: FolderOpen },
    { label: "Pipeline value", value: usd(active.reduce((a, r) => a + r.job.budget, 0), { cents: true }), sub: "Across active client projects", icon: Wallet },
    {
      label: "Estimated gross profit",
      value: usd(priced.reduce((a, r) => a + r.profitability.expectedGrossMargin, 0), { cents: true }),
      sub: "Priced jobs · before labor & tax",
      icon: ArrowUpRight,
    },
    { label: "Needs your attention", value: String(waiting), sub: "Approvals & revision requests", icon: ShieldCheck, attention: waiting > 0, href: "/approvals" },
  ];

  return (
    <div className="flex flex-col gap-10">
      <ProductionPoller active={generating} />
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Studio / {month}</p>
          <h1 className="mt-3 text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[40px]">Your studio, at a glance.</h1>
          <p className="mt-3 text-[14px] text-muted-foreground">Good work starts with a clear view of what’s next.</p>
        </div>
        <Button asChild size="lg" className="h-11 rounded-lg px-5 shadow-sm">
          <Link href="/jobs/new">
            <Plus /> New job
          </Link>
        </Button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Studio summary">
        {kpis.map((k) => {
          const body = (
            <>
              <div className="flex items-start justify-between">
                <span className="text-[13px] text-muted-foreground">{k.label}</span>
                <k.icon className="size-[18px] text-muted-foreground/70" strokeWidth={1.6} />
              </div>
              <div className={cn("tnum mt-5 text-[30px] font-semibold leading-none tracking-[-0.02em]", k.attention && "text-warn")}>{k.value}</div>
              <div className="mt-3 text-[12.5px] text-muted-foreground">{k.sub}</div>
            </>
          );
          const cls = "rounded-xl border bg-card p-6 shadow-[0_1px_2px_rgb(0_0_0/0.03)]";
          return k.href ? (
            <Link key={k.label} href={k.href} className={cn(cls, "transition-colors hover:border-foreground/20")}>
              {body}
            </Link>
          ) : (
            <div key={k.label} className={cls}>
              {body}
            </div>
          );
        })}
      </section>

      {waiting > 0 ? (
        <Link href="/approvals" className="group flex flex-wrap items-center gap-4 rounded-xl border border-brand/15 bg-brand-soft/70 px-6 py-5 transition-colors hover:bg-brand-soft">
          <span className="grid size-10 place-items-center rounded-lg border border-brand/15 bg-card/70">
            <ShieldCheck className="size-5 text-warn" strokeWidth={1.6} />
          </span>
          <span className="min-w-0 flex-1 basis-56">
            <span className="block text-[14px] font-semibold">A little direction. Then let it run.</span>
            <span className="mt-0.5 block text-[13px] text-muted-foreground">
              {waitingJobs} job{waitingJobs > 1 ? "s are" : " is"} waiting on your approval or feedback.
            </span>
          </span>
          <span className="ml-14 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-foreground/80 group-hover:text-foreground sm:ml-0">
            Review approvals <ArrowRight className="size-4" />
          </span>
        </Link>
      ) : (
        <div className="flex items-center gap-4 rounded-xl border bg-card px-6 py-5">
          <ShieldCheck className="size-5 text-ok" strokeWidth={1.6} />
          <span className="text-[13.5px] text-muted-foreground">Nothing is waiting on you. The agent stays inside the limits you set.</span>
        </div>
      )}

      <JobPipeline rows={rows} status={status} q={q} basePath="/" />
    </div>
  );
}
