"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { updateStepAction } from "@/app/actions";
import { useServerAction } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { ModelCategory } from "@/lib/domain/types";
import { usd } from "@/lib/utils";

export interface StepEditorModel {
  id: string;
  label: string;
  unitCostUsd: number;
  unitLabel: string;
  verified: boolean;
}

export interface StepEditorStep {
  id: string;
  name: string;
  category: ModelCategory;
  purpose: string;
  inputs: string[];
  expectedOutputs: string[];
  modelId: string;
  status: string;
  unitCost: number;
  estimatedAttempts: number;
}

const lines = (xs: string[]) => xs.join("\n");
const split = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** Edit a step that has not started: prompt text, inputs, expected outputs, model and attempts. */
export function StepEditor({ jobId, step, models, maxAttempts }: { jobId: string; step: StepEditorStep; models: StepEditorModel[]; maxAttempts: number }) {
  const [open, setOpen] = React.useState(false);
  const { pending, error, exec, setError } = useServerAction();
  const [name, setName] = React.useState(step.name);
  const [purpose, setPurpose] = React.useState(step.purpose);
  const [inputs, setInputs] = React.useState(lines(step.inputs));
  const [outputs, setOutputs] = React.useState(lines(step.expectedOutputs));
  const [modelId, setModelId] = React.useState(step.modelId);
  const [attempts, setAttempts] = React.useState(String(step.estimatedAttempts));

  const model = models.find((m) => m.id === modelId);
  const unit = modelId === step.modelId ? step.unitCost : (model?.unitCostUsd ?? step.unitCost);
  const n = Math.max(0, Math.floor(Number(attempts) || 0));

  function save(mode: "save" | "retry" | "rerun") {
    exec(
      () => updateStepAction(jobId, step.id, { name, purpose, inputs: split(inputs), expectedOutputs: split(outputs), modelId, estimatedAttempts: n }, mode),
      () => setOpen(false),
    );
  }

  function reset() {
    setName(step.name);
    setPurpose(step.purpose);
    setInputs(lines(step.inputs));
    setOutputs(lines(step.expectedOutputs));
    setModelId(step.modelId);
    setAttempts(String(step.estimatedAttempts));
    setError(null);
  }

  if (!open) {
    return (
      <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
        <Pencil /> {step.status === "done" ? "Edit & re-run" : "Edit"}
      </Button>
    );
  }
  const id = `edit-${step.id}`;
  return (
    <form
      className="col-span-full mt-1 flex w-full flex-col gap-3 rounded-lg border bg-background p-3 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        save(step.status === "done" ? "rerun" : "save");
      }}
    >
      <div className="grid gap-3 md:grid-cols-[1fr_16rem_6rem]">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-name`}>Step name</Label>
          <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-model`}>Model</Label>
          <NativeSelect id={`${id}-model`} value={modelId} onChange={(e) => setModelId(e.target.value)}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {usd(m.unitCostUsd, { cents: true })} {m.unitLabel}
                {m.verified ? "" : " (unverified)"}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-attempts`}>Attempts</Label>
          <Input id={`${id}-attempts`} type="number" min={1} max={maxAttempts} value={attempts} onChange={(e) => setAttempts(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-purpose`}>Prompt / purpose</Label>
        <Textarea id={`${id}-purpose`} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        <span className="text-[11px] text-muted-foreground">Sent to the model as the start of every prompt for this step, followed by the inputs and the brief.</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-inputs`}>Inputs (one per line)</Label>
          <Textarea id={`${id}-inputs`} value={inputs} onChange={(e) => setInputs(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-outputs`}>Expected outputs (one per line)</Label>
          <Textarea id={`${id}-outputs`} value={outputs} onChange={(e) => setOutputs(e.target.value)} />
        </div>
      </div>
      {step.status === "done" ? (
        <p className="text-[12px] text-muted-foreground">Re-running makes new takes for this step. Later steps go back to pending and run again afterwards; earlier takes are kept but lose their approval. This spends from the approved cap.</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tnum text-[12.5px] text-muted-foreground">
          {n} × {usd(unit, { cents: true })} = <span className="font-medium text-foreground">{usd(unit * n, { cents: true })}</span>
        </span>
        <div className="flex items-center gap-2">
          {error ? <span className="text-[12px] text-destructive">{error}</span> : null}
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { reset(); setOpen(false); }}>
            Cancel
          </Button>
          <Button type="submit" size="sm" variant={step.status === "failed" ? "outline" : "default"} disabled={pending}>
            {pending ? "Saving…" : step.status === "done" ? "Save & re-run" : "Save step"}
          </Button>
          {step.status === "failed" ? (
            <Button type="button" size="sm" disabled={pending} onClick={() => save("retry")}>
              Save &amp; retry
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  );
}
