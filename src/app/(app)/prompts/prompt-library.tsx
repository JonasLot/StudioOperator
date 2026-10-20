"use client";

import * as React from "react";
import Link from "next/link";
import { BookMarked, Check, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { deletePromptAction, savePromptAction, updatePromptAction, type PromptFields } from "@/app/actions";
import { useServerAction } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_LABEL, type ModelCategory, type SavedPrompt } from "@/lib/domain/types";
import { extractVariables, PROMPT_CATEGORIES } from "@/lib/prompts/library";
import { dateTime } from "@/lib/utils";

interface ModelOption {
  id: string;
  label: string;
  category: ModelCategory;
}

const blank: PromptFields = { name: "", category: "image", modelId: null, tags: "", body: "", notes: "" };
const toFields = (p: SavedPrompt): PromptFields => ({ name: p.name, category: p.category, modelId: p.modelId, tags: p.tags.join(", "), body: p.body, notes: p.notes ?? "" });

export function PromptLibrary({ prompts, models }: { prompts: SavedPrompt[]; models: ModelOption[] }) {
  const [filter, setFilter] = React.useState<"all" | ModelCategory>("all");
  const [query, setQuery] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const q = query.trim().toLowerCase();
  const shown = prompts.filter((p) => (filter === "all" || p.category === filter) && (!q || [p.name, p.body, p.notes ?? "", p.tags.join(" ")].join(" ").toLowerCase().includes(q)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-40">
          <NativeSelect aria-label="Filter by kind" value={filter} onChange={(e) => setFilter(e.target.value as "all" | ModelCategory)}>
            <option value="all">All kinds</option>
            {PROMPT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Input aria-label="Search prompts" className="w-64" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, text or tag" />
        <span className="text-[12.5px] text-muted-foreground">{shown.length} of {prompts.length}</span>
        <Button size="sm" className="ml-auto" onClick={() => setAdding((v) => !v)}>
          <Plus /> New prompt
        </Button>
      </div>

      {adding ? <PromptForm models={models} initial={blank} submitLabel="Save prompt" onSubmit={(f) => savePromptAction(f)} onDone={() => setAdding(false)} /> : null}

      {prompts.length === 0 && !adding ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed bg-card px-6 py-8 text-[13.5px] text-muted-foreground">
          <BookMarked className="size-5" />
          <p>Nothing saved yet. Approve a take on a job and use the bookmark on it, or save a step’s prompt from its editor. You can also write one here.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((p) => (
            <PromptCard key={p.id} p={p} models={models} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PromptCard({ p, models }: { p: SavedPrompt; models: ModelOption[] }) {
  const [editing, setEditing] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const { pending, error, exec } = useServerAction();
  const model = models.find((m) => m.id === p.modelId);
  const vars = extractVariables(p.body);

  if (editing) {
    return (
      <li>
        <PromptForm models={models} initial={toFields(p)} submitLabel="Save changes" onSubmit={(f) => updatePromptAction(p.id, f)} onDone={() => setEditing(false)} />
      </li>
    );
  }
  return (
    <li className="rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold">{p.name}</span>
            <Badge variant="secondary">{CATEGORY_LABEL[p.category]}</Badge>
            {model ? <span className="text-[12px] text-muted-foreground">{model.label}</span> : null}
            {p.tags.map((t) => (
              <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">#{t}</span>
            ))}
          </div>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Used {p.uses}× · updated {dateTime(p.updatedAt)}
            {p.sourceJobId ? (
              <>
                {" "}· from <Link href={`/jobs/${p.sourceJobId}?tab=workflow`} className="underline underline-offset-2">a job</Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(p.body).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
          <Button size="xs" variant="ghost" disabled={pending} onClick={() => window.confirm(`Delete “${p.name}”?`) && exec(() => deletePromptAction(p.id))} aria-label={`Delete ${p.name}`}>
            <Trash2 />
          </Button>
        </div>
      </div>
      <pre className="mx-4 mb-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 font-sans text-[12.5px] leading-relaxed">{p.body}</pre>
      {vars.length || p.notes || error ? (
        <div className="flex flex-col gap-1 border-t px-4 py-2 text-[12px] text-muted-foreground">
          {vars.length ? <span>Variables: {vars.map((v) => `{{${v}}}`).join(" ")}</span> : null}
          {p.notes ? <span>{p.notes}</span> : null}
          {error ? <span className="text-destructive">{error}</span> : null}
        </div>
      ) : null}
    </li>
  );
}

function PromptForm({ models, initial, submitLabel, onSubmit, onDone }: { models: ModelOption[]; initial: PromptFields; submitLabel: string; onSubmit: (f: PromptFields) => ReturnType<typeof savePromptAction>; onDone: () => void }) {
  const { pending, error, exec } = useServerAction();
  const [f, setF] = React.useState(initial);
  const set = <K extends keyof PromptFields>(k: K, v: PromptFields[K]) => setF((x) => ({ ...x, [k]: v }));
  const forKind = models.filter((m) => m.category === f.category);
  const uid = React.useId();

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        exec(() => onSubmit(f), onDone);
      }}
    >
      <div className="grid gap-3 md:grid-cols-[1fr_10rem_16rem]">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${uid}-name`}>Name</Label>
          <Input id={`${uid}-name`} value={f.name} onChange={(e) => set("name", e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${uid}-cat`}>Kind of step</Label>
          <NativeSelect id={`${uid}-cat`} value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value, modelId: null }))}>
            {PROMPT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${uid}-model`}>Proven on (optional)</Label>
          <NativeSelect id={`${uid}-model`} value={f.modelId ?? ""} onChange={(e) => set("modelId", e.target.value || null)}>
            <option value="">Any model</option>
            {forKind.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${uid}-body`}>Prompt</Label>
        <Textarea id={`${uid}-body`} value={f.body} onChange={(e) => set("body", e.target.value)} className="min-h-32" required />
        <span className="text-[11px] text-muted-foreground">Variables: {"{{logline}} {{tone}} {{visual_direction}} {{audience}} {{key_messages}} {{must_haves}} {{avoid}} {{brief}} {{format}}"}. Anything else stays as written for you to fill in.</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${uid}-tags`}>Tags (comma separated)</Label>
          <Input id={`${uid}-tags`} value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="product, hero, dawn" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${uid}-notes`}>Notes (optional)</Label>
          <Input id={`${uid}-notes`} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="When to use it, what to watch for" />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        {error ? <span className="text-[12px] text-destructive">{error}</span> : null}
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
