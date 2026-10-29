"use client";

import * as React from "react";
import { ListRestart, Loader2, Save, TriangleAlert } from "lucide-react";
import { listDraftModelsAction, saveDraftModelAction, type DraftModelState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRESETS = [
  { label: "Ollama (local)", baseUrl: "http://localhost:11434/v1" },
  { label: "LM Studio (local)", baseUrl: "http://localhost:1234/v1" },
  { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
];

/** Where the first-phase AI lives: any OpenAI-compatible endpoint. The optional key is saved in the API keys card. */
export function DraftModelForm({ baseUrl, model, saved, enabled, installed: initialModels }: { baseUrl: string; model: string; saved: boolean; enabled: boolean; installed: string[] | null }) {
  const [state, action, pending] = React.useActionState<DraftModelState, FormData>(saveDraftModelAction, undefined);
  const [url, setUrl] = React.useState(baseUrl);
  const [name, setName] = React.useState(model);
  const [models, setModels] = React.useState<string[] | null>(initialModels);
  const [listError, setListError] = React.useState<string | null>(null);
  const [listing, startListing] = React.useTransition();

  function fetchModels(from: string) {
    setListError(null);
    startListing(async () => {
      const r = await listDraftModelsAction(from);
      if (r.ok) {
        setModels(r.models);
        // Keep the typed name if it exists there; otherwise suggest the first installed one.
        setName((current) => (r.models.includes(current) || r.models.includes(`${current}:latest`) ? current : r.models[0]));
      } else {
        setModels(null);
        setListError(r.error);
      }
    });
  }

  const isInstalled = models && (models.includes(name) || models.includes(`${name}:latest`));
  const savedMissing = initialModels && model && !(initialModels.includes(model) || initialModels.includes(`${model}:latest`));

  return (
    <form action={action} autoComplete="off" className="flex flex-col gap-4">
      <p className="text-[13px] text-muted-foreground">
        A cheap or local model that writes the first draft of each job’s creative brief and suggests step prompts. Astra then sharpens the brief with you. Any OpenAI-compatible <code className="rounded bg-muted px-1">/chat/completions</code> endpoint works.
      </p>
      {!enabled ? (
        <p className="flex items-start gap-2 rounded-lg border bg-muted px-3 py-2 text-[12.5px]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>Saving here needs an <code className="rounded bg-card px-1">ADMIN_PASSCODE</code>. Without one, set <code className="rounded bg-card px-1">DRAFT_AI_BASE_URL</code> and <code className="rounded bg-card px-1">DRAFT_AI_MODEL</code> in the environment.</span>
        </p>
      ) : null}
      {savedMissing ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg border bg-bad-soft px-3 py-2 text-[12.5px]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>The saved model “{model}” is not installed at this endpoint, so drafts fall back to the offline drafter. Pick an installed model below and save.</span>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <Button key={p.label} type="button" size="xs" variant="outline" onClick={() => { setUrl(p.baseUrl); fetchModels(p.baseUrl); }}>
            {p.label}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_16rem]">
        <div className="flex flex-col gap-1">
          <Label htmlFor="draft-url">Endpoint</Label>
          <div className="flex gap-1.5">
            <Input id="draft-url" name="baseUrl" value={url} onChange={(e) => { setUrl(e.target.value); setModels(null); }} placeholder="http://localhost:11434/v1" spellCheck={false} />
            <Button type="button" variant="outline" disabled={listing || !url} onClick={() => fetchModels(url)} title="Ask the endpoint which models it has">
              {listing ? <Loader2 className="animate-spin" /> : <ListRestart />} Fetch models
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="draft-model">Model</Label>
          <Input id="draft-model" name="model" list="draft-model-options" value={name} onChange={(e) => setName(e.target.value)} placeholder="gemma4" spellCheck={false} />
          <datalist id="draft-model-options">
            {(models ?? []).map((m) => <option key={m} value={m} />)}
          </datalist>
        </div>
      </div>
      {models ? (
        <div className="flex flex-col gap-1.5 text-[12.5px]">
          <span className="text-muted-foreground">Installed at this endpoint:</span>
          <div className="flex flex-wrap gap-1.5">
            {models.map((m) => (
              <Button key={m} type="button" size="xs" variant={m === name ? "default" : "outline"} onClick={() => setName(m)}>
                {m}
              </Button>
            ))}
          </div>
          {name && !isInstalled ? <span className="text-bad">“{name}” is not in that list. Saving will work, but drafts will fall back offline.</span> : null}
        </div>
      ) : null}
      {listError ? <p role="alert" className="rounded-lg border bg-bad-soft px-3 py-2 text-[12.5px]">{listError}</p> : null}
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
