import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getModel } from "@/lib/higgsfield/catalog";
import { loadRuntimeConfig } from "@/lib/runtime-config";
import { ensureSeeded } from "@/lib/seed";
import { generationSpend } from "@/lib/services/economics";
import { takeQa } from "@/lib/services/qa";
import { getBundle } from "@/lib/services/studio";
import { ReviewBoard, type BoardGroup } from "./review-board";

export const dynamic = "force-dynamic";

export default async function OutputReviewPage(props: PageProps<"/jobs/[id]/outputs/review">) {
  await loadRuntimeConfig();
  await ensureSeeded();
  const { id } = await props.params;
  const bundle = await getBundle(id);
  if (!bundle) notFound();
  const { job, workflow, generations, revisions } = bundle;
  const qa = await takeQa(job.id);

  const toTake = (g: (typeof generations)[number]) => ({
    id: g.id,
    attempt: g.attempt,
    modelLabel: getModel(g.model).label,
    prompt: g.prompt,
    cost: generationSpend(g),
    outputUrl: g.outputUrl,
    outputType: g.outputType,
    reviewStatus: g.reviewStatus,
    reviewNote: g.reviewNote,
    selected: g.selected,
    createdAt: g.createdAt,
    qa: qa[g.id] ?? null,
  });

  const raw = workflow
    ? [
        ...workflow.steps.map((s) => ({ key: s.id, title: `${s.order}. ${s.name}`, purpose: s.purpose, gens: generations.filter((g) => g.stepId === s.id && !g.revisionId) })),
        ...revisions
          .filter((r) => r.runStatus !== "not_started")
          .map((r) => ({ key: r.id, title: `Revision — ${r.actionSummary}`, purpose: r.clientNote, gens: generations.filter((g) => g.revisionId === r.id) })),
      ]
    : [];
  const groups: BoardGroup[] = raw
    .map((grp) => {
      const usable = grp.gens.filter((g) => g.status === "completed" && g.outputUrl);
      return { key: grp.key, title: grp.title, purpose: grp.purpose, takes: usable.map(toTake), unavailable: grp.gens.length - usable.length };
    })
    .filter((grp) => grp.takes.length > 0 || grp.unavailable > 0);

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/jobs/${job.id}?tab=outputs`} className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back to job
      </Link>
      <header>
        <p className="eyebrow">Review outputs</p>
        <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em]">{job.title}</h1>
      </header>
      {groups.some((g) => g.takes.length) ? (
        <ReviewBoard jobId={job.id} groups={groups} />
      ) : (
        <p className="rounded-xl border border-dashed bg-card px-4 py-6 text-[13px] text-muted-foreground">
          No finished takes to review yet. Outputs appear here once production has produced them.
        </p>
      )}
    </div>
  );
}
