"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { updateStepAction } from "@/app/actions";
import { useServerAction } from "@/components/action-button";
import { NativeSelect } from "@/components/ui/native-select";
import { usd } from "@/lib/utils";
import type { StepEditorModel, StepEditorStep } from "./step-editor";

/**
 * Choose which model runs a step, straight from the step card. Saving reprices the step with the same
 * attempts; the server refuses a change that would push an approved plan over its cap.
 */
export function StepModelPicker({ jobId, step, models }: { jobId: string; step: StepEditorStep; models: (StepEditorModel & { local?: boolean })[] }) {
  const { pending, error, exec } = useServerAction();
  const [value, setValue] = React.useState(step.modelId);
  // While saving, show the choice; afterwards show what the server stored (a refused change rolls back).
  const shown = pending ? value : step.modelId;

  function choose(modelId: string) {
    if (modelId === step.modelId) return;
    setValue(modelId);
    exec(
      () =>
        updateStepAction(
          jobId,
          step.id,
          { name: step.name, purpose: step.purpose, inputs: step.inputs, expectedOutputs: step.expectedOutputs, modelId, estimatedAttempts: step.estimatedAttempts },
          "save",
        ),
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="sr-only" htmlFor={`model-${step.id}`}>Model for {step.name}</label>
      <div className="flex w-full items-center gap-1.5">
        {pending ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
        <NativeSelect id={`model-${step.id}`} className="h-8 text-[12.5px] font-medium" value={shown} disabled={pending} onChange={(e) => choose(e.target.value)}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} · {m.local ? "local" : `${usd(m.unitCostUsd, { cents: true })} ${m.unitLabel}`}
              {m.verified ? "" : " (unverified)"}
            </option>
          ))}
        </NativeSelect>
      </div>
      {error ? <span role="alert" className="max-w-56 text-left text-[11.5px] text-bad">{error}</span> : null}
    </div>
  );
}
