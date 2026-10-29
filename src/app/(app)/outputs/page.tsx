import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { StatusPill } from "@/components/job-pipeline";
import { PageHeader } from "@/components/page-header";
import { getModel } from "@/lib/higgsfield/catalog";
import { getRepo } from "@/lib/repo";
import { loadRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

export default async function OutputsPage() {
  await loadRuntimeConfig();
  const repo = getRepo();
  // Archived jobs are filed away; their outputs stay reachable from the job itself.
  const jobs = (await repo.listJobs()).filter((j) => !j.archivedAt);
  const sections = (
    await Promise.all(
      jobs.map(async (job) => {
        const gens = (await repo.listGenerations(job.id)).filter((g) => g.status === "completed" && g.outputUrl);
        return { job, selected: gens.filter((g) => g.selected), total: gens.length };
      }),
    )
  ).filter((s) => s.total > 0);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Workspace / Outputs"
        title="Selected outputs"
        subtitle="The takes chosen for delivery on each job. Open a job to change selects or see every attempt."
      />
      {sections.length === 0 ? <p className="rounded-xl border bg-card px-6 py-8 text-[13px] text-muted-foreground">No outputs yet. Approve a workflow and start production.</p> : null}
      {sections.map(({ job, selected, total }) => (
        <section key={job.id} className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="truncate text-[15px] font-semibold">{job.title}</span>
              <StatusPill status={job.status} />
            </div>
            <Link href={`/jobs/${job.id}?tab=outputs`} className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
              {selected.length} selected of {total} <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-3 xl:grid-cols-5">
            {selected.map((g) => (
              <figure key={g.id} className="overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.outputUrl!} alt={`${getModel(g.model).label} take ${g.attempt}`} className="aspect-video w-full object-cover" loading="lazy" />
                <figcaption className="flex items-center justify-between gap-2 px-2.5 py-2 text-[11.5px]">
                  <span className="truncate text-muted-foreground">{getModel(g.model).label}</span>
                  <Check className="size-3.5 shrink-0 text-ok" />
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
