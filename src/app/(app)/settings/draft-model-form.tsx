"use client";

import * as React from "react";
import { Loader2, Save, TriangleAlert } from "lucide-react";
import { saveDraftModelAction, type DraftModelState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRESETS = [
  { label: "Ollama (local)", baseUrl: "http://localhost:11434/v1", model: "llama3.2" },
  { label: "LM Studio (local)", baseUrl: "http://localhost:1234/v1", model: "" },
  { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "" },
];

/** Where the first-phase AI lives: any OpenAI-compatible endpoint. The optional key is saved in the API keys card. */
export function DraftModelForm({ baseUrl, model, saved, enabled }: { baseUrl: string; model: string; saved: boolean; enabled: boolean }) {
  const [state, action, pending] = React.useActionState<DraftModelState, FormData>(saveDraftModelAction, undefined);
  const [url, setUrl] = React.useState(baseUrl);
  const [name, setName] = React.useState(model);

  return (
    <form action={action} autoComplete="off" className="flex flex-col gap-4">
      <p className="text-[13px] text-muted-foreground">
        A cheap or local model that writes the first draft of each job’s creative brief. Astra then sharpens it with you. Any OpenAI-compatible <code className="rounded bg-muted px-1">/chat/completions</code> endpoint works. The server must be able to reach it; a local model (Ollama, LM Studio) fits well.
      </p>
      {!enabled ? (
        <p className="flex items-start gap-2 rounded-lg border bg-muted px-3 py-2 text-[12.5px]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>Saving here needs an <code className="rounded bg-card px-1">ADMIN_PASSCODE</code>. Without one, set <code className="rounded bg-card px-1">DRAFT_AI_BASE_URL</code> and <code className="rounded bg-card px-1">DRAFT_AI_MODEL</code> in the environment.</span>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <Button key={p.label} type="button" size="xs" variant="outline" onClick={() => { setUrl(p.baseUrl); if (p.model) setName(p.model); }}>
            {p.label}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_14rem]">
        <div className="flex flex-col gap-1">
          <Label htmlFor="draft-url">Endpoint</Label>
          <Input id="draft-url" name="baseUrl" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:11434/v1" spellCheck={false} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="draft-model">Model</Label>
          <Input id="draft-model" name="model" value={name} onChange={(e) => setName(e.target.value)} placeholder="llama3.2" spellCheck={false} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5 border-t pt-4">
        <Label htmlFor="draft-passcode">Admin passcode</Label>
        <Input id="draft-passcode" name="passcode" type="password" autoComplete="off" required disabled={!enabled} placeholder="Required for every change" />
      </div>
      {saved ? (
        <label className="flex w-fit items-center gap-2 text-[12.5px]">
          <input type="checkbox" name="clear" /> Clear the saved endpoint (use the environment variables instead)
        </label>
      ) : null}
      {state?.error ? <p role="alert" className="rounded-lg border bg-bad-soft px-3 py-2 text-[13px]">{state.error}</p> : null}
      {state?.ok ? <p role="status" className="rounded-lg border bg-ok-soft px-3 py-2 text-[13px]">{state.message}</p> : null}
      <Button type="submit" className="w-fit" disabled={pending || !enabled}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />} Save endpoint
      </Button>
    </form>
  );
}
