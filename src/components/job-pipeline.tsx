import Link from "next/link";
import { ArrowUpRight, Clapperboard, Clock, FileText, Hand, ImageIcon, Loader2, Search } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { JOB_STATUSES, SOURCE_LABEL, type JobStatus } from "@/lib/domain/types";
import type { getDashboard } from "@/lib/services/studio";
import { STATUS_META } from "@/lib/status-meta";
import { cn, daysUntil, pct, shortDate, usd } from "@/lib/utils";

type Row = Awaited<ReturnType<typeof getDashboard>>[number];

const KIND_ICON = { video: Clapperboard, image: ImageIcon, brief: FileText };

export function StatusPill({ status, className }: { status: JobStatus; className?: string }) {
  const m = STATUS_META[status];
  return <span className={cn("inline-flex items-center rounded-md px-2 py-1 text-[12px] font-medium whitespace-nowrap", m.pill, className)}>{m.label}</span>;
}

function href(base: string, status: string | null, q: string) {
  const p = new URLSearchParams();
  if (status) p.set("status", status);
  if (q) p.set("q", q);
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

export function JobPipeline({ rows, status, q, basePath, title = "Job pipeline", subtitle = "From first brief to final handoff." }: { rows: Row[]; status: JobStatus | null; q: string; basePath: string; title?: string; subtitle?: string }) {
  const query = q.trim().toLowerCase();
  const searched = query
    ? rows.filter((r) => [r.job.title, r.job.clientName ?? "", SOURCE_LABEL[r.job.source], r.job.rawBrief].some((t) => t.toLowerCase().includes(query)))
    : rows;
  const visible = status ? searched.filter((r) => r.job.status === status) : searched;
  const groups = JOB_STATUSES.map((s) => ({ s, items: visible.filter((r) => r.job.status === s) })).filter((g) => g.items.length);

  return (
    <section aria-label={title} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {title}
            <span className="tnum rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{rows.length}</span>
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
        </div>
        <form action={basePath} className="relative w-full sm:w-64" role="search">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Find a job…"
            className="h-10 w-full rounded-lg border bg-card pl-9 pr-3 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"
          />
        </form>
      </div>

      <div className="-mx-4 overflow-x-auto px-4">
        <div className="grid min-w-[760px] grid-cols-7 gap-3" role="tablist" aria-label="Filter by stage">
          {JOB_STATUSES.map((s) => {
            const n = searched.filter((r) => r.job.status === s).length;
            const active = status === s;
            return (
              <Link
                key={s}
                href={href(basePath, active ? null : s, q)}
                role="tab"
                aria-selected={active}
                data-column={s}
                className={cn("group flex flex-col gap-2.5 pt-0 text-[13px] transition-colors", status && !active ? "opacity-55 hover:opacity-100" : "")}
              >
                <span className={cn("h-[3px] rounded-full", STATUS_META[s].bar, active && "h-1")} />
                <span className={cn("flex items-center gap-2", active ? "font-semibold text-foreground" : "text-muted-foreground group-hover:text-foreground")}>
                  {STATUS_META[s].label}
                  <span className="tnum rounded bg-muted px-1.5 py-px text-[10.5px] font-medium text-muted-foreground">{n}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
        <div className="hidden grid-cols-[minmax(0,1fr)_150px_120px_120px_110px_28px] gap-4 border-b px-6 py-3.5 md:grid">
          {["Project / client", "Status", "Source", "Client price", "Deadline", ""].map((h) => (
            <span key={h} className="eyebrow text-[10.5px]">{h}</span>
          ))}
        </div>
        {groups.length === 0 ? (
          <div className="px-6 py-14 text-center text-[13px] text-muted-foreground">
            {query ? `No jobs match “${q}”.` : status ? `Nothing in ${STATUS_META[status].label} right now.` : "No jobs yet — paste your first brief."}
          </div>
        ) : null}
        {groups.map(({ s, items }) => (
          <div key={s} data-group={s}>
            <div className="flex items-center gap-2 border-b bg-muted/35 px-6 py-2.5 text-[12px] text-muted-foreground">
              {STATUS_META[s].label}
              <span className="tnum rounded bg-card px-1.5 py-px text-[10.5px]">{items.length}</span>
            </div>
            {items.map((r) => {
              const Icon = KIND_ICON[r.kind];
              const d = daysUntil(r.job.deadline);
              const open = !["delivered", "rejected"].includes(r.job.status);
              const urgent = open && d <= 2;
              return (
                <Link
                  key={r.job.id}
                  href={`/jobs/${r.job.id}`}
                  className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b px-6 py-4 transition-colors last:border-b-0 hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_150px_120px_120px_110px_28px]"
                  data-job={r.job.id}
                >
                  <span className="flex min-w-0 items-center gap-4">
                    <span className="grid size-11 shrink-0 place-items-center rounded-lg border bg-muted/50">
                      <Icon className="size-[18px] text-muted-foreground" strokeWidth={1.6} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14.5px] font-medium">{r.job.title}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
                        {r.job.clientName ?? "Unnamed client"}
                        <span aria-hidden>·</span>
                        {r.stepCount ? `${r.stepCount} production steps` : "not analysed"}
                        {r.pendingApprovals.length ? (
                          <span className="ml-1 inline-flex items-center gap-1 text-warn">
                            <Hand className="size-3" /> {r.pendingApprovals.length}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1.5 md:items-start">
                    <StatusPill status={r.job.status} />
                    {r.job.status === "generating" ? (
                      <span className="flex w-24 items-center gap-1.5">
                        <Progress value={r.progress * 100} className="h-1" />
                        {r.activeGenerations ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : null}
                      </span>
                    ) : null}
                  </span>
                  <span className="hidden text-[13.5px] text-muted-foreground md:block">{SOURCE_LABEL[r.job.source]}</span>
                  <span className="hidden md:block">
                    <span className="tnum block text-[14px] font-semibold">{usd(r.job.budget, { cents: true })}</span>
                    {r.stepCount ? <span className="tnum text-[11.5px] text-muted-foreground">{pct(r.profitability.expectedGrossMarginPct)} margin</span> : null}
                  </span>
                  <span className={cn("hidden items-center gap-1.5 text-[13.5px] md:flex", urgent ? "text-bad" : "text-muted-foreground")}>
                    <Clock className="size-4" strokeWidth={1.6} />
                    {shortDate(r.job.deadline)}
                  </span>
                  <ArrowUpRight className="hidden size-4 text-muted-foreground/60 transition-colors group-hover:text-foreground md:block" />
                  <span className="col-span-2 flex items-center gap-3 text-[12px] text-muted-foreground md:hidden">
                    {SOURCE_LABEL[r.job.source]} · <span className="tnum font-medium text-foreground">{usd(r.job.budget, { cents: true })}</span> · due {shortDate(r.job.deadline)}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
