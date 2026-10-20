"use client";

import * as React from "react";
import { Check, Loader2, TriangleAlert, X } from "lucide-react";
import { reviewGenerationAction, setStepReviewAction } from "@/app/actions";
import { useServerAction } from "@/components/action-button";
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
}

/** A step's takes inline: preview and approve / reject without leaving the Workflow tab. */
export function StepTakes({ jobId, takes, canReview }: { jobId: string; takes: TakeView[]; canReview: boolean }) {
  const { pending, error, exec } = useServerAction();
  if (!takes.length) return null;
  return (
    <div className="mt-3">
      <ul className="flex flex-wrap gap-2">
        {takes.map((g) => {
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
              </div>
            </li>
          );
        })}
      </ul>
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
