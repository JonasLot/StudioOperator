"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { addStepAction } from "@/app/actions";
import { useServerAction } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { usd } from "@/lib/utils";
import type { StepEditorModel } from "./step-editor";

/** Add a step after any step that has not started yet (or first, when nothing has started). */
export function AddStep({
  jobId,
  positions,
  models,
  maxAttempts,
}: {
  jobId: string;
  positions: { afterOrder: number; label: string }[];
  models: (StepEditorModel & { categoryLabel: string })[];
  maxAttempts: number;
}) {
  const [open, setOpen] = React.useState(false);
  const { pending, error, exec } = useServerAction();
  const [name, setName] = React.useState("");
  const [purpose, setPurpose] = React.useState("");
  const [modelId, setModelId] = React.useState(models[0]?.id ?? "");
  const [attempts, setAttempts] = React.useState("2");
  const [after, setAfter] = React.useState(String(positions[positions.length - 1]?.afterOrder ?? 0));

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="self-start" onClick={() => setOpen(true)}>
        <Plus /> Add step
      </Button>
    );
  }
  const model = models.find((m) => m.id === modelId);
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        exec(
          () => addStepAction(jobId, { afterOrder: Number(after), name, modelId, purpose, estimatedAttempts: Number(attempts) }),
          () => {
            setOpen(false);
            setName("");
            setPurpose("");
          },
        );
      }}
    >
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_14rem_6rem]">
        <div className="flex flex-col gap-1">
          <Label htmlFor="add-name">Step name</Label>
          <Input id="add-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="add-after">Place after</Label>
          <NativeSelect id="add-after" value={after} onChange={(e) => setAfter(e.target.value)}>
            {positions.map((p) => (
              <option key={p.afterOrder} value={p.afterOrder}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="add-model">Model</Label>
          <NativeSelect id="add-model" value={modelId} onChange={(e) => setModelId(e.target.value)}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.categoryLabel}: {m.label} · {usd(m.unitCostUsd, { cents: true })} {m.unitLabel}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="add-attempts">Attempts</Label>
          <Input id="add-attempts" type="number" min={1} max={maxAttempts} value={attempts} onChange={(e) => setAttempts(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="add-purpose">Prompt / purpose</Label>
        <Textarea id="add-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tnum text-[12.5px] text-muted-foreground">
          {model ? usd(model.unitCostUsd * (Number(attempts) || 0), { cents: true }) : ""} added to the estimate
        </span>
        <div className="flex items-center gap-2">
          {error ? <span className="text-[12px] text-destructive">{error}</span> : null}
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Adding…" : "Add step"}
          </Button>
        </div>
      </div>
    </form>
  );
}
