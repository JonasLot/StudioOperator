"use client";

import * as React from "react";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { updateEconomicsAction } from "@/app/actions";
import { useServerAction } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EconomicsEditor({ jobId, sourceFeePct, contingencyPct, capLocked }: { jobId: string; sourceFeePct: number; contingencyPct: number; capLocked: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [fee, setFee] = React.useState(String(+(sourceFeePct * 100).toFixed(2)));
  const [cont, setCont] = React.useState(String(+(contingencyPct * 100).toFixed(2)));
  const { pending, error, exec } = useServerAction();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-1.5 border-t px-5 py-3 text-left text-[12px] text-muted-foreground hover:bg-muted/40 hover:text-foreground">
        <SlidersHorizontal className="size-3.5" /> Adjust fee & contingency
      </button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2 border-t px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        exec(() => updateEconomicsAction(jobId, { sourceFeePct: Number(fee) / 100, contingencyPct: Number(cont) / 100 }), () => setOpen(false));
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-muted-foreground">
          Source / channel fee %
          <Input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" className="tnum mt-1 h-8 text-[13px]" />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Contingency %
          <Input value={cont} onChange={(e) => setCont(e.target.value)} inputMode="decimal" className="tnum mt-1 h-8 text-[13px]" />
        </label>
      </div>
      {!capLocked ? <p className="text-[11px] text-muted-foreground">Changing contingency also updates the proposed cap.</p> : null}
      <div className="flex gap-2">
        <Button size="xs" type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Save
        </Button>
        <Button size="xs" variant="ghost" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error ? <p className="text-xs text-bad">{error}</p> : null}
    </form>
  );
}
