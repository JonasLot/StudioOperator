"use client";

import * as React from "react";
import { Lock, LockOpen, Loader2, MessageSquare, Sparkles, Wand2 } from "lucide-react";
import { draftBriefAction, lockBriefAction, saveBriefEditsAction, sparBriefAction, unlockBriefAction } from "@/app/actions";
import { useServerAction } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FIELD_LABEL, LIST_FIELDS, TEXT_FIELDS, type CreativeBrief } from "@/lib/creative/brief";
import type { CreativeBriefRecord } from "@/lib/domain/types";
import { cn, dateTime } from "@/lib/utils";

const HINT: Partial<Record<keyof CreativeBrief, string>> = {
  logline: "One sentence: what the piece is and why it exists.",
  visualDirection: "Palette, light, camera, texture, references.",
  keyMessages: "One per line.",
  mustHaves: "One per line. Elements that have to be in the result.",
  avoid: "One per line. Kept out of every prompt.",
  openQuestions: "One per line. For you and the client; never sent to a model.",
};

const toForm = (b: CreativeBrief) => ({
  ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, b[k]])),
  ...Object.fromEntries(LIST_FIELDS.map((k) => [k, b[k].join("\n")])),
}) as Record<keyof CreativeBrief, string>;

const fromForm = (f: Record<keyof CreativeBrief, string>) => ({
  ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, f[k]])),
  ...Object.fromEntries(LIST_FIELDS.map((k) => [k, f[k].split("\n")])),
});

/**
 * The creative brief of a job. Phase one: a cheap or local model drafts it. Phase two: the operator spars
 * with Astra until it is right. Locking it makes it part of every step prompt.
 */
export function CreativeBriefCard({ jobId, record, closed, drafterLabel, astraLabel }: { jobId: string; record: CreativeBriefRecord | null; closed: boolean; drafterLabel: string; astraLabel: string }) {
  const { pending, error, exec } = useServerAction();

  if (!record) {
    return (
      <Shell status={null}>
        <p className="text-[13px] text-muted-foreground">
          Turn the client’s brief into a short creative direction before any paid step runs. A first draft from <span className="font-medium text-foreground">{drafterLabel}</span> costs next to nothing; then you can sharpen it with Astra.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" disabled={pending || closed} onClick={() => exec(() => draftBriefAction(jobId))}>
            {pending ? <Loader2 className="animate-spin" /> : <Wand2 />} Draft creative brief
          </Button>
          {error ? <span className="text-[12px] text-destructive">{error}</span> : null}
        </div>
      </Shell>
    );
  }

  const locked = record.status === "locked";
  return (
    <Shell status={record.status} aside={<span className="text-[11.5px] text-muted-foreground">Drafted by {record.drafter} · updated {dateTime(record.updatedAt)}</span>}>
      {locked ? (
        <LockedView jobId={jobId} record={record} closed={closed} />
      ) : (
        <Editor key={record.updatedAt} jobId={jobId} record={record} closed={closed} drafterLabel={drafterLabel} astraLabel={astraLabel} />
      )}
    </Shell>
  );
}

function Shell({ status, aside, children }: { status: "draft" | "locked" | null; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]" data-creative-brief>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-brand" />
          <h3 className="text-[14px] font-semibold">Creative brief</h3>
          {status ? <Badge variant={status === "locked" ? "default" : "secondary"}>{status === "locked" ? "Locked" : "Draft"}</Badge> : null}
        </div>
        {aside}
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function LockedView({ jobId, record, closed }: { jobId: string; record: CreativeBriefRecord; closed: boolean }) {
  const { pending, error, exec } = useServerAction();
  const b = record.brief;
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <p className="text-[13.5px] font-medium">{b.logline}</p>
      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[max-content_1fr]">
        {TEXT_FIELDS.filter((k) => k !== "logline" && b[k]).map((k) => (
          <React.Fragment key={k}>
            <dt className="text-muted-foreground">{FIELD_LABEL[k]}</dt>
            <dd>{b[k]}</dd>
          </React.Fragment>
        ))}
        {LIST_FIELDS.filter((k) => b[k].length).map((k) => (
          <React.Fragment key={k}>
            <dt className="text-muted-foreground">{FIELD_LABEL[k]}</dt>
            <dd>{b[k].join(" · ")}</dd>
          </React.Fragment>
        ))}
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <span className="text-[12px] text-muted-foreground">Part of every step prompt submitted from now on{record.lockedAt ? ` · locked ${dateTime(record.lockedAt)}` : ""}.</span>
        <div className="flex items-center gap-2">
          {error ? <span className="text-[12px] text-destructive">{error}</span> : null}
          <Button size="xs" variant="outline" disabled={pending || closed} onClick={() => exec(() => unlockBriefAction(jobId))}>
            <LockOpen /> Unlock to edit
          </Button>
        </div>
      </div>
    </div>
  );
}

function Editor({ jobId, record, closed, drafterLabel, astraLabel }: { jobId: string; record: CreativeBriefRecord; closed: boolean; drafterLabel: string; astraLabel: string }) {
  const { pending, error, exec } = useServerAction();
  const initial = React.useMemo(() => toForm(record.brief), [record.brief]);
  const [form, setForm] = React.useState(initial);
  const [message, setMessage] = React.useState("");
  const dirty = (Object.keys(form) as (keyof CreativeBrief)[]).some((k) => form[k] !== initial[k]);
  const set = (k: keyof CreativeBrief, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Unsaved edits are saved first, so sparring and locking always act on what is on screen.
  const withSave = (next: () => ReturnType<typeof lockBriefAction>) => async () => {
    if (dirty) {
      const r = await saveBriefEditsAction(jobId, fromForm(form));
      if (!r.ok) return r;
    }
    return next();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        {[...TEXT_FIELDS, ...LIST_FIELDS].map((k) => (
          <div key={k} className={cn("flex flex-col gap-1", (k === "logline" || k === "visualDirection") && "md:col-span-2")}>
            <Label htmlFor={`cb-${k}`}>{FIELD_LABEL[k]}</Label>
            <Textarea id={`cb-${k}`} value={form[k]} onChange={(e) => set(k, e.target.value)} disabled={closed} className="min-h-10" rows={1} />
            {HINT[k] ? <span className="text-[11px] text-muted-foreground">{HINT[k]}</span> : null}
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-background p-3">
        <h4 className="flex items-center gap-1.5 text-[12.5px] font-semibold">
          <MessageSquare className="size-3.5" /> Spar with Astra
          <span className="font-normal text-muted-foreground">· {astraLabel}</span>
        </h4>
        {record.thread.length ? (
          <ul className="mt-2 flex max-h-72 flex-col gap-2 overflow-y-auto text-[12.5px]">
            {record.thread.map((m, i) => (
              <li
                key={i}
                className={cn(
                  "whitespace-pre-wrap rounded-md px-2.5 py-1.5",
                  m.role === "operator" && "ml-8 bg-brand-soft/50",
                  m.role === "astra" && "mr-8 bg-muted",
                  m.role === "system" && "bg-warn-soft text-warn",
                )}
              >
                <span className="mb-0.5 block text-[10.5px] uppercase tracking-wide text-muted-foreground">{m.role === "operator" ? "You" : m.role === "astra" ? "Astra" : "Note"}</span>
                {m.content}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[12px] text-muted-foreground">Tell Astra what is off or missing, or let it review the draft on its own. Each answer rewrites the fields above.</p>
        )}
        <div className="mt-2 flex flex-col gap-2">
          <Textarea
            aria-label="Message to Astra"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={pending || closed}
            placeholder="e.g. Make it less corporate, and the hero must be the bottle at dawn."
            className="min-h-16"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={pending || closed || !message.trim()} onClick={() => exec(withSave(() => sparBriefAction(jobId, message)), () => setMessage(""))}>
              {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Send to Astra
            </Button>
            <Button size="sm" variant="outline" disabled={pending || closed} onClick={() => exec(withSave(() => sparBriefAction(jobId, "")))}>
              Let Astra review it
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <Button
          size="xs"
          variant="ghost"
          disabled={pending || closed}
          onClick={() => {
            if (window.confirm(`Draft again with ${drafterLabel}? This replaces the current draft and the conversation.`)) exec(() => draftBriefAction(jobId));
          }}
        >
          <Wand2 /> Draft again
        </Button>
        <div className="flex items-center gap-2">
          {error ? <span className="max-w-80 text-[12px] text-destructive">{error}</span> : null}
          {dirty ? <span className="text-[12px] text-muted-foreground">Unsaved edits</span> : null}
          <Button size="sm" variant="outline" disabled={pending || closed || !dirty} onClick={() => exec(() => saveBriefEditsAction(jobId, fromForm(form)))}>
            Save edits
          </Button>
          <Button size="sm" disabled={pending || closed} onClick={() => exec(withSave(() => lockBriefAction(jobId)))}>
            <Lock /> Lock brief
          </Button>
        </div>
      </div>
    </div>
  );
}
