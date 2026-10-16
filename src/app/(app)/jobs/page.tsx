import Link from "next/link";
import { Plus } from "lucide-react";
import { JobPipeline } from "@/components/job-pipeline";
import { PageHeader } from "@/components/page-header";
import { ProductionPoller } from "@/components/poller";
import { Button } from "@/components/ui/button";
import { JOB_STATUSES, type JobStatus } from "@/lib/domain/types";
import { getDashboard } from "@/lib/services/studio";

export const dynamic = "force-dynamic";

export default async function AllJobsPage(props: PageProps<"/jobs">) {
  const sp = await props.searchParams;
  const status = typeof sp.status === "string" && (JOB_STATUSES as readonly string[]).includes(sp.status) ? (sp.status as JobStatus) : null;
  const q = typeof sp.q === "string" ? sp.q : "";
  const rows = getDashboard();
  return (
    <div className="flex flex-col gap-10">
      <ProductionPoller active={rows.some((r) => r.job.status === "generating")} />
      <PageHeader
        eyebrow="Workspace / All jobs"
        title="All jobs"
        subtitle="Every brief you have pasted in, from intake to handoff. Filter by stage or search by client, title or brief text."
        action={
          <Button asChild size="lg" className="h-11 rounded-lg px-5">
            <Link href="/jobs/new">
              <Plus /> New job
            </Link>
          </Button>
        }
      />
      <JobPipeline rows={rows} status={status} q={q} basePath="/jobs" title="Jobs" subtitle="Grouped by stage." />
    </div>
  );
}
