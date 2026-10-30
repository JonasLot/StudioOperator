"use client";

import * as React from "react";
import { Loader2, Plus, Save, X } from "lucide-react";
import { saveInvoiceDraftAction } from "@/app/actions";
import { useServerAction } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usd } from "@/lib/utils";

type Line = { description: string; quantity: string; unitPrice: string };
type Draft = { clientName: string; issueDate: string; dueDate: string; notes: string; lines: Line[] };

const total = (lines: Line[]) => lines.reduce((a, l) => a + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);

export function InvoiceEditor({ id, defaults, jobPrice }: { id: string; defaults: Draft; jobPrice: number | null }) {
  const [d, setD] = React.useState<Draft>(defaults);
  const { pending, error, exec } = useServerAction();
  const [savedAt, setSavedAt] = React.useState<Draft | null>(defaults);
  const dirty = JSON.stringify(d) !== JSON.stringify(savedAt);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setLine = (i: number, patch: Partial<Line>) => setD((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const sum = Math.round(total(d.lines) * 100) / 100;

  return (
    <form
      aria-label="Edit draft"
      className="rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]"
      onSubmit={(e) => {
        e.preventDefault();
        const snapshot = d;
        exec(() => saveInvoiceDraftAction(id, d), () => setSavedAt(snapshot));
      }}
    >
      <div className="flex items-center justify-between gap-2 border-b px-6 py-4">
        <h2 className="text-[14.5px] font-semibold">Edit draft</h2>
        {dirty ? <span className="text-[12px] text-warn">Unsaved changes</span> : <span className="text-[12px] text-muted-foreground">Saved</span>}
      </div>
      <div className="flex flex-col gap-5 px-6 py-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_170px_170px]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inv-client">Bill to</Label>
            <Input id="inv-client" value={d.clientName} onChange={(e) => set({ clientName: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inv-issue">Issue date</Label>
            <Input id="inv-issue" type="date" value={d.issueDate} onChange={(e) => set({ issueDate: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inv-due">Due date</Label>
            <Input id="inv-due" type="date" value={d.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[13px] font-medium">Lines</legend>
          <div className="hidden grid-cols-[minmax(0,1fr)_80px_130px_110px_32px] gap-2 text-[11.5px] text-muted-foreground sm:grid">
            <span>Description</span>
            <span>Qty</span>
            <span>Unit price (USD)</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          {d.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_32px] gap-2 rounded-lg border p-2 sm:grid-cols-[minmax(0,1fr)_80px_130px_110px_32px] sm:items-center sm:rounded-none sm:border-0 sm:p-0">
              <Input aria-label={`Line ${i + 1} description`} value={l.description} placeholder="What was delivered" onChange={(e) => setLine(i, { description: e.target.value })} />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-9 sm:order-last"
                aria-label={`Remove line ${i + 1}`}
                disabled={d.lines.length === 1}
                onClick={() => setD((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))}
              >
                <X />
              </Button>
              <Input aria-label={`Line ${i + 1} quantity`} inputMode="decimal" className="tnum" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
              <Input aria-label={`Line ${i + 1} unit price`} inputMode="decimal" className="tnum" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
              <span className="tnum col-span-2 text-right text-[13.5px] sm:col-span-1">{usd((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), { cents: true })}</span>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Button type="button" size="sm" variant="ghost" disabled={d.lines.length >= 30} onClick={() => setD((x) => ({ ...x, lines: [...x.lines, { description: "", quantity: "1", unitPrice: "" }] }))}>
              <Plus /> Add line
            </Button>
            <span className="text-[13.5px]">
              Total <span className="tnum ml-2 text-[16px] font-semibold">{usd(sum, { cents: true })}</span>
              {jobPrice !== null && Math.abs(sum - jobPrice) > 0.005 ? <span className="tnum ml-2 text-[12px] text-muted-foreground">job price {usd(jobPrice, { cents: true })}</span> : null}
            </span>
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inv-notes">Note on the invoice</Label>
          <Textarea id="inv-notes" rows={3} value={d.notes} placeholder="Optional — e.g. 50% deposit as agreed, or a thank-you." onChange={(e) => set({ notes: e.target.value })} />
        </div>

        {error ? <p role="alert" className="rounded-lg border bg-bad-soft px-3 py-2 text-[13px]">{error}</p> : null}
        <div>
          <Button type="submit" size="sm" disabled={pending || !dirty}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save draft
          </Button>
        </div>
      </div>
    </form>
  );
}
