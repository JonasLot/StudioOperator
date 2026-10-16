"use client";

import * as React from "react";
import { Loader2, Play, Plus } from "lucide-react";
import { addRevisionAction, runRevisionAction } from "@/app/actions";
import { ActionButton, useServerAction } from "@/components/action-button";
import { ApprovalBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { BriefView, Generation, Job, Revision } from "@/lib/domain/types";
import type { Profitability } from "@/lib/services/economics";
import { dateTime, usd } from "@/lib/utils";

const ACTION_LABEL: Record<Revision["recommendedAction"], string> = {
  regenerate_shot: "Regenerate shot",
  regrade: "Regrade",
  fix_text: "Fix text frame",
  rerecord_voice: "Re-record VO",
  re_edit: "Re-edit",
  new_deliverable: "New deliverable (scope change)",
  clarify: "Clarify with client",
};

export function RevisionsTab({ job, analysis, revisions, profitability: p, generations }: { job: Job; analysis: BriefView | null; revisions: Revision[]; profitability: Profitability; generations: Generation[] }) {
  const { pending, error, exec } = useServerAction();
  const [note, setNote] = React.useState("");
  const [deliverable, setDeliverable] = React.useState("");
  const canAdd = job.status === "qa";
  const busy = generations.some((g) => g.status === "queued" || g.status === "in_progress");

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)] p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-semibold">Log a client revision note</h3>
          <span className="tnum text-[11px] text-muted-foreground">{usd(p.remainingBudget, { cents: true })} left under the approved cap</span>
        </div>
        {canAdd ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              exec(() => addRevisionAction(job.id, note, deliverable || null), () => setNote(""));
            }}
          >
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Paste the client’s note, e.g. “Can the cabin shot be warmer?”"
              className="min-h-16 text-[13px]"
              name="note"
            />
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-56">
                <NativeSelect value={deliverable} onChange={(e) => setDeliverable(e.target.value)} className="h-8 text-[13px]" aria-label="Affected deliverable">
                  <option value="">Detect deliverable</option>
                  {analysis?.deliverables.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.id} · {d.title}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Button type="submit" size="sm" disabled={pending || !note.trim()}>
                {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add note
              </Button>
              {error ? <span className="text-xs text-bad">{error}</span> : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Notes that fit inside the remaining cap are auto-approved for the agent. Scope changes and anything over the cap wait for you.
            </p>
          </form>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {job.status === "delivered" ? "Job delivered — log follow-up work as a new job." : "Revision notes are collected once outputs are in QA."}
          </p>
        )}
      </section>

      {revisions.length === 0 ? <p className="px-1 text-[13px] text-muted-foreground">No revision notes yet.</p> : null}
      <ul className="flex flex-col gap-2">
        {revisions.map((r) => (
          <li key={r.id} className="rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)] px-4 py-3" data-revision={r.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px]">“{r.clientNote}”</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                  <Badge variant={r.materialChange ? "warn" : "secondary"}>{ACTION_LABEL[r.recommendedAction]}</Badge>
                  {r.affectedDeliverable ? <Badge variant="outline">{r.affectedDeliverable}</Badge> : null}
                  <ApprovalBadge a={{ status: r.approvalStatus }} />
                  {r.approvalStatus === "approved" && !r.requiresApproval ? <span className="text-[11px] text-muted-foreground">within limits</span> : null}
                  {r.runStatus === "running" ? <Badge variant="info"><Loader2 className="animate-spin" /> Running</Badge> : null}
                  {r.runStatus === "done" ? <Badge variant="ok">Applied</Badge> : null}
                </div>
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">{r.actionSummary}</p>
                {r.approvalReason ? <p className="mt-1 text-[12px] text-warn">Needs approval: {r.approvalReason}</p> : null}
              </div>
              <div className="flex flex-col items-end gap-1.5 text-right">
                <span className="tnum text-[13px] font-semibold">{r.expectedIncrementalCost ? `+${usd(r.expectedIncrementalCost, { cents: true })}` : "—"}</span>
                <span className="text-[11px] text-muted-foreground">{r.attempts ? `${r.attempts} attempts` : "no generation"} · {dateTime(r.createdAt)}</span>
                {r.approvalStatus === "approved" && r.runStatus === "not_started" && r.modelId && !r.materialChange ? (
                  <ActionButton size="xs" disabled={busy || job.status !== "qa"} action={() => runRevisionAction(job.id, r.id)}>
                    <Play /> Run revision
                  </ActionButton>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
