"use client";

import * as React from "react";
import { BookMarked, Check, Loader2, TriangleAlert, X } from "lucide-react";
import { reviewGenerationAction, savePromptFromTakeAction, setStepReviewAction } from "@/app/actions";
import { useServerAction } from "@/components/action-button";
import { groupRuns } from "@/lib/services/take-rounds";
import { cn } from "@/lib/utils";

export interface TakeView {
  id: string;
  attempt: number;
  status: string;
  outputUrl: string | null;
  outputType: "image" | "video" | "audio" | null;
  reviewStatus: "pending" | "approved" | "rejected";
  selected: boolean;
  error: string | null;
  prompt: string;
  createdAt: string;
}

/** A step's takes inline: preview and approve / reject without leaving the Workflow tab. */
export function StepTakes({ jobId, takes, canReview, stepName }: { jobId: string; takes: TakeView[]; canReview: boolean; stepName: string }) {
  const { pending, error, exec } = useServerAction();
  if (!takes.length) return null;
  const runs = groupRuns(takes);
  const tile = (g: TakeView) => {
    const ready = g.status === "completed" && g.outputUrl;
    const mock = g.outputUrl?.startsWith("/api/mock-output");
    return (
      <li key={g.id} className={cn("w-36 overflow-hidden rounded-md border bg-muted/40", g.reviewStatus === "approved" && "ring-2 ring-ok", g.reviewStatus === "rejected" && "opacity-60")}>
        <div className="aspect-video">
          {ready ? (
            g.outputType === "video" && !mock ? (
              <video src={g.outputUrl!} className="size-full object-cover" muted controls preload="metadata" />
            ) : g.outputType === "audio" && !mock ? (
              <audio src={g.outputUrl!} controls className="size-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.outputUrl!} alt={`Take ${g.attempt}`} className="size-full object-cover" loading="lazy" />
            )
          ) : g.status === "queued" || g.status === "in_progress" ? (
            <div className="grid size-full place-items-center text-[11px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /></div>
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1 px-2 text-center text-[11px] text-bad" title={g.error ?? g.status}>
              <TriangleAlert className="size-4" />
              <span className="line-clamp-2">{g.error ?? g.status}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-1.5 py-1 text-[11px]">
          <span className="tnum text-muted-foreground">Take {g.attempt}</span>
          <span className="inline-flex items-center gap-1">
          {canReview && g.status === "completed" ? (
            <span className="inline-flex gap-1">
              <button type="button" disabled={pending} title="Approve" aria-label={`Approve take ${g.attempt}`} className={cn("grid size-5 place-items-center rounded border", g.reviewStatus === "approved" && "bg-ok/15 text-ok")} onClick={() => exec(() => reviewGenerationAction(jobId, g.id, g.reviewStatus === "approved" ? "pending" : "approved"))}>
                <Check className="size-3" />
              </button>
              <button type="button" disabled={pending} title="Reject" aria-label={`Reject take ${g.attempt}`} className={cn("grid size-5 place-items-center rounded border", g.reviewStatus === "rejected" && "bg-bad/15 text-bad")} onClick={() => exec(() => reviewGenerationAction(jobId, g.id, g.reviewStatus === "rejected" ? "pending" : "rejected"))}>
                <X className="size-3" />
              </button>
            </span>
          ) : g.reviewStatus === "approved" ? (
            <span className="text-ok">Approved</span>
          ) : null}
          {g.reviewStatus === "approved" && g.status === "completed" ? (
            <button
              type="button"
              disabled={pending}
              title="Save the prompt that produced this take to the prompt library"
              aria-label={`Save the prompt of take ${g.attempt} to the library`}
              className="grid size-5 place-items-center rounded border"
              onClick={() => {
                const name = window.prompt("Name for this prompt in the library", stepName);
                if (name?.trim()) exec(() => savePromptFromTakeAction(jobId, g.id, name));
              }}
            >
              <BookMarked className="size-3" />
            </button>
          ) : null}
          </span>
        </div>
      </li>
    );
  };
  // After a re-run the runs sit side by side, newest first, each with the prompt it used.
  return (
    <div className="mt-3">
      <div className={cn("flex gap-4", runs.length > 1 && "overflow-x-auto pb-2")}>
        {runs.map((run, i) => (
          <section key={run[0].id} className={cn("flex flex-col gap-1.5", runs.length > 1 && "w-[26rem] max-w-full shrink-0 rounded-lg border bg-background/50 p-2")} data-run={runs.length - i}>
            {runs.length > 1 ? (
              <header className="max-w-[18rem] text-[11px]">
                <span className="font-medium">{i === 0 ? "Latest run" : `Run ${runs.length - i}`}</span>
                <span className="text-muted-foreground"> · {run.length} take{run.length === 1 ? "" : "s"}</span>
                <p className="line-clamp-2 text-muted-foreground" title={run[0].prompt}>{run[0].prompt.split("\n")[0]}</p>
              </header>
            ) : null}
            <ul className="flex flex-wrap gap-2">{run.map(tile)}</ul>
          </section>
        ))}
      </div>
      {error ? <p className="mt-1 text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}

/** Whether the next step waits for the operator to approve this step's takes. */
export function ReviewToggle({ jobId, stepId, checked }: { jobId: string; stepId: string; checked: boolean }) {
  const { pending, error, exec } = useServerAction();
  return (
    <label className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <input type="checkbox" checked={checked} disabled={pending} onChange={(e) => exec(() => setStepReviewAction(jobId, stepId, e.target.checked))} />
      Require my approval before the next step
      {error ? <span className="text-destructive">{error}</span> : null}
    </label>
  );
}
