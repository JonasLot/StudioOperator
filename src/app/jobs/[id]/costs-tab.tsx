import { GenStatusBadge } from "@/components/status";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Generation, Revision, Workflow } from "@/lib/domain/types";
import { getModel } from "@/lib/higgsfield/catalog";
import { generationSpend, type Profitability } from "@/lib/services/economics";
import { cn, dateTime, usd } from "@/lib/utils";
import { Section } from "./section";

export function CostsTab({ workflow, generations, revisions, profitability: p }: { workflow: Workflow | null; generations: Generation[]; revisions: Revision[]; profitability: Profitability }) {
  if (!workflow) return <p className="rounded-xl border border-dashed bg-card px-4 py-6 text-[13px] text-muted-foreground">No cost estimate yet.</p>;
  const used = p.maxBudget ? (p.committedSpend / p.maxBudget) * 100 : 0;
  const rows = workflow.steps.map((s) => {
    const sg = generations.filter((g) => g.stepId === s.id && !g.revisionId);
    return {
      s,
      submitted: sg.length,
      committed: sg.reduce((a, g) => a + generationSpend(g), 0),
      actual: sg.reduce((a, g) => a + (g.actualCost ?? 0), 0),
    };
  });
  const revRows = revisions.filter((r) => r.runStatus !== "not_started");
  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-4">
        {[
          ["Plan estimate", usd(workflow.estimatedTotalCost, { cents: true })],
          ["Approved cap", workflow.approvalStatus === "approved" ? usd(p.maxBudget) : `${usd(p.maxBudget)} (proposed)`],
          ["Committed", usd(p.committedSpend, { cents: true })],
          ["Reconciled actual", usd(p.actualSpend, { cents: true })],
        ].map(([k, v]) => (
          <div key={k} className="bg-card px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</div>
            <div className="tnum mt-0.5 text-lg font-semibold">{v}</div>
          </div>
        ))}
      </section>
      <div className="flex items-center gap-3 text-[12.5px]">
        <Progress value={used} className="h-2" indicatorClassName={cn(used > 90 ? "bg-bad" : used > 70 ? "bg-warn" : "bg-ok")} />
        <span className="tnum shrink-0 text-muted-foreground">
          {Math.round(used)}% of cap · {usd(p.remainingBudget, { cents: true })} left
        </span>
      </div>

      <Section title="Estimate vs spend by step">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Step</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Est. attempts</TableHead>
              <TableHead className="text-right">Submitted</TableHead>
              <TableHead className="text-right">Estimate</TableHead>
              <TableHead className="text-right">Committed</TableHead>
              <TableHead className="text-right">Δ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ s, submitted, committed }) => {
              const delta = committed - s.estimatedTotalCost;
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.order}. {s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{getModel(s.modelId).label}</TableCell>
                  <TableCell className="tnum text-right">{s.estimatedAttempts}</TableCell>
                  <TableCell className="tnum text-right">{submitted || "—"}</TableCell>
                  <TableCell className="tnum text-right">{usd(s.estimatedTotalCost, { cents: true })}</TableCell>
                  <TableCell className="tnum text-right">{submitted ? usd(committed, { cents: true }) : "—"}</TableCell>
                  <TableCell className={cn("tnum text-right", submitted && delta > 0.005 ? "text-bad" : "text-muted-foreground")}>
                    {submitted ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}` : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
            {revRows.map((r) => {
              const rg = generations.filter((g) => g.revisionId === r.id);
              const committed = rg.reduce((a, g) => a + generationSpend(g), 0);
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">Revision · {r.recommendedAction.replace("_", " ")}</TableCell>
                  <TableCell className="text-muted-foreground">{r.modelId ? getModel(r.modelId).label : "—"}</TableCell>
                  <TableCell className="tnum text-right">{r.attempts}</TableCell>
                  <TableCell className="tnum text-right">{rg.length}</TableCell>
                  <TableCell className="tnum text-right">{usd(r.expectedIncrementalCost, { cents: true })}</TableCell>
                  <TableCell className="tnum text-right">{usd(committed, { cents: true })}</TableCell>
                  <TableCell className="tnum text-right text-muted-foreground">—</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4}>Total</TableCell>
              <TableCell className="tnum text-right">{usd(workflow.estimatedTotalCost, { cents: true })}</TableCell>
              <TableCell className="tnum text-right">{usd(p.committedSpend, { cents: true })}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </Section>

      <Section title="Generation ledger" aside={<span className="tnum text-[11px] text-muted-foreground">{generations.length} requests</span>}>
        {generations.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No provider requests yet. Nothing is spent until production starts.</p>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>Request ID</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Estimate</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Finished</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...generations].reverse().map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-mono text-[11.5px] text-muted-foreground">{g.providerRequestId ?? "—"}</TableCell>
                    <TableCell>{getModel(g.model).label}</TableCell>
                    <TableCell><GenStatusBadge status={g.status} /></TableCell>
                    <TableCell className="tnum text-right">{usd(g.costEstimate, { cents: true })}</TableCell>
                    <TableCell className="tnum text-right">{g.actualCost !== null ? usd(g.actualCost, { cents: true }) : <span className="text-muted-foreground">pending</span>}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{dateTime(g.startedAt)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{dateTime(g.completedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}
