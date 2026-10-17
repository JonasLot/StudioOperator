"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Loader2, ScanSearch, TriangleAlert, X } from "lucide-react";
import { toggleSelectAction } from "@/app/actions";
import { useServerAction } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Generation, Job, Revision, Workflow } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

function Tile({ g, jobId, onToggle, disabled }: { g: Generation; jobId: string; onToggle: (id: string) => void; disabled: boolean }) {
  const done = g.status === "completed" && g.outputUrl;
  return (
    <figure
      className={cn(
        "group relative overflow-hidden rounded-md border bg-muted/40",
        g.selected && "ring-2 ring-ok ring-offset-1 ring-offset-background",
        g.reviewStatus === "rejected" && "opacity-60",
      )}
      data-generation={g.id}
      data-status={g.status}
    >
      <div className="aspect-video">
        {done ? (
          g.outputType === "video" && !g.outputUrl!.startsWith("/api/mock-output") ? (
            <video src={g.outputUrl!} className="size-full object-cover" muted controls preload="metadata" />
          ) : g.outputType === "audio" && !g.outputUrl!.startsWith("/api/mock-output") ? (
            <audio src={g.outputUrl!} controls className="size-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={g.outputUrl!} alt={`Take ${g.attempt}`} className="size-full object-cover" loading="lazy" />
          )
        ) : g.status === "queued" || g.status === "in_progress" ? (
          <div className="grid size-full place-items-center text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" />
              {g.status === "queued" ? "Queued" : "Rendering"}
            </span>
          </div>
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 px-2 text-center text-[11px] text-bad">
            <TriangleAlert className="size-4" />
            <span className="line-clamp-2">{g.error ?? g.status}</span>
          </div>
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-1 px-1.5 py-1 text-[11px]">
        <span className="tnum inline-flex items-center gap-1 text-muted-foreground">
          #{g.attempt}
          {g.reviewStatus === "rejected" ? <X className="size-3 text-bad" aria-label="Rejected" /> : null}
        </span>
        {done ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onToggle(g.id)}
            className={cn(
              "inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-medium transition-colors",
              g.selected ? "bg-ok-soft text-ok" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            aria-pressed={g.selected}
            data-select={g.id}
          >
            {g.selected ? <Check className="size-3" /> : null}
            {g.selected ? "Selected" : "Select"}
          </button>
        ) : null}
      </figcaption>
      <span className="sr-only">{jobId}</span>
    </figure>
  );
}

export function OutputsTab({ job, workflow, generations, revisions }: { job: Job; workflow: Workflow | null; generations: Generation[]; revisions: Revision[] }) {
  const { pending, error, exec } = useServerAction();
  const toggle = (id: string) => exec(() => toggleSelectAction(job.id, id));
  if (!workflow || generations.length === 0) {
    return (
      <p className="rounded-xl border border-dashed bg-card px-4 py-6 text-[13px] text-muted-foreground">
        {job.status === "approved" ? "Approved and ready — start production from the Workflow tab." : "No outputs yet. Generation only starts after you approve the workflow and budget."}
      </p>
    );
  }
  const groups = [
    ...workflow.steps.map((s) => ({ key: s.id, title: `${s.order}. ${s.name}`, gens: generations.filter((g) => g.stepId === s.id && !g.revisionId) })),
    ...revisions
      .filter((r) => r.runStatus !== "not_started")
      .map((r) => ({ key: r.id, title: `Revision — ${r.actionSummary}`, gens: generations.filter((g) => g.revisionId === r.id) })),
  ].filter((x) => x.gens.length);
  const selected = generations.filter((g) => g.selected).length;
  const completedGens = generations.filter((g) => g.status === "completed" && g.outputUrl);
  const completedCount = completedGens.length;
  const reviewed = completedGens.filter((g) => g.reviewStatus !== "pending").length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <p className="text-muted-foreground">
          Pick the takes that go into delivery. The agent pre-selects the first usable take per step. <span className="text-foreground">{selected} selected.</span>
        </p>
        <Button asChild size="sm" variant={reviewed < completedCount ? "default" : "outline"}>
          <Link href={`/jobs/${job.id}/outputs/review`}>
            <ScanSearch /> Review outputs
            <span className="tnum text-[11px] opacity-80">{reviewed}/{completedCount}</span>
          </Link>
        </Button>
        {error ? <span className="text-xs text-bad">{error}</span> : null}
      </div>
      {groups.map((grp) => {
        const done = grp.gens.filter((g) => g.status === "completed").length;
        const failed = grp.gens.filter((g) => ["failed", "nsfw"].includes(g.status)).length;
        return (
          <section key={grp.key} className="rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
              <h3 className="text-[13px] font-semibold">{grp.title}</h3>
              <div className="tnum flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Badge variant="outline">{done}/{grp.gens.length} done</Badge>
                {failed ? <Badge variant="bad">{failed} failed</Badge> : null}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4 xl:grid-cols-6">
              {grp.gens.map((g) => (
                <Tile key={g.id} g={g} jobId={job.id} onToggle={toggle} disabled={pending} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
