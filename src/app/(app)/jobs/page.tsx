import Link from "next/link";
import { Plus } from "lucide-react";
import { JobPipeline } from "@/components/job-pipeline";
import { PageHeader } from "@/components/page-header";
import { ProductionPoller } from "@/components/poller";
import { Button } from "@/components/ui/button";
import { JOB_STATUSES, type JobStatus } from "@/lib/domain/types";
import { partitionArchived } from "@/lib/domain/archive";
import { getDashboard } from "@/lib/services/studio";
import { loadRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

export default async function AllJobsPage(props: PageProps<"/jobs">) {
  await loadRuntimeConfig();
  const sp = await props.searchParams;
  const status = typeof sp.status === "string" && (JOB_STATUSES as readonly string[]).includes(sp.status) ? (sp.status as JobStatus) : null;
  const q = typeof sp.q === "string" ? sp.q : "";
  const archivedView = sp.view === "archived";
  const { current, archived } = partitionArchived(await getDashboard(), (r) => r.job);
  const rows = archivedView ? archived : current;
  return (
    <div className="flex flex-col gap-10">
      <ProductionPoller active={rows.some((r) => r.job.status === "generating")} />
      <PageHeader
        eyebrow={archivedView ? "Workspace / All jobs / Archive" : "Workspace / All jobs"}
        title={archivedView ? "Archive" : "All jobs"}
        subtitle={
          archivedView
            ? "Delivered and rejected jobs you have filed away. Open one to restore it to the pipeline."
            : "Every brief you have pasted in, from intake to handoff. Filter by stage or search by client, title or brief text."
        }
        action={
          <Button asChild size="lg" className="h-11 rounded-lg px-5">
            <Link href="/jobs/new">
              <Plus /> New job
            </Link>
          </Button>
        }
      />
      <JobPipeline
        rows={rows}
        status={status}
        q={q}
        basePath="/jobs"
        title={archivedView ? "Archived jobs" : "Jobs"}
        subtitle={archivedView ? "Grouped by how they closed." : "Grouped by stage."}
        view={archivedView ? "archived" : "current"}
        archivedCount={archived.length}
      />
    </div>
  );
}
