import { ArrowUpRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { Job } from "@/lib/domain/types";
import { SOURCE_LABEL } from "@/lib/domain/types";
import type { Profitability } from "@/lib/services/economics";
import { cn, pct, usd } from "@/lib/utils";
import { EconomicsEditor } from "./economics-editor";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 text-[13.5px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="tnum font-medium">{value}</span>
    </div>
  );
}

export function ProfitabilityPanel({ job, p, locked }: { job: Job; p: Profitability; locked: boolean }) {
  const m = p.expectedGrossMarginPct;
  const tone = m < 0.15 ? "text-bad" : m < 0.45 ? "text-warn" : "text-ok";
  const bar = m < 0.15 ? "bg-bad" : m < 0.45 ? "bg-warn" : "bg-ok";
  const priced = p.estimatedSpend > 0;
  return (
    <section className="rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]" aria-label="Profitability">
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold">Profitability</h3>
          <ArrowUpRight className="size-4 text-muted-foreground" />
        </div>
        <div className={cn("tnum mt-4 text-[44px] font-semibold leading-none tracking-[-0.03em]", priced ? tone : "text-muted-foreground")} data-margin>
          {priced ? (m * 100).toFixed(1) : "—"}
          {priced ? <span className="ml-0.5 text-[22px]">%</span> : null}
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">{priced ? "expected gross margin" : "priced after analysis"}</p>
        <Progress value={Math.max(0, m) * 100} className="mt-4 h-1.5" indicatorClassName={bar} />
      </div>
      <div className="mt-3 divide-y px-5">
        <Row label="Client price" value={usd(p.clientPrice, { cents: true })} />
        <Row label={`Generation estimate${p.approvedRevisionSpend ? " + revisions" : ""}`} value={usd(p.estimatedSpend, { cents: true })} />
        <Row label={`Contingency · ${pct(p.contingencyPct)}`} value={usd(p.contingency, { cents: true })} />
        <Row label={`${SOURCE_LABEL[job.source]} fee · ${pct(p.sourceFeePct, p.sourceFeePct * 100 % 1 ? 1 : 0)}`} value={usd(p.sourceFee, { cents: true })} />
        <div className="flex items-baseline justify-between gap-3 py-3 text-[14px] font-semibold">
          <span className={tone}>Expected profit</span>
          <span className={cn("tnum", tone)}>{usd(p.expectedGrossMargin, { cents: true })}</span>
        </div>
      </div>
      <p className="px-5 pb-4 text-[11.5px] text-muted-foreground">Before labor, analysis usage & tax</p>
      <div className="tnum flex flex-col gap-1 border-t bg-muted/30 px-5 py-3.5 text-[12px] text-muted-foreground">
        <div className="flex justify-between">
          <span>Generation cap {locked ? "" : "(proposed)"}</span>
          <span className="text-foreground">{usd(p.maxBudget, { cents: true })}</span>
        </div>
        <div className="flex justify-between">
          <span>Committed so far</span>
          <span className="text-foreground">{usd(p.committedSpend, { cents: true })}</span>
        </div>
        <div className="flex justify-between">
          <span>Worst case, cap fully spent</span>
          <span className="text-foreground">{pct(p.worstCaseMarginPct, 1)}</span>
        </div>
      </div>
      <EconomicsEditor jobId={job.id} sourceFeePct={job.sourceFeePct} contingencyPct={job.contingencyPct} capLocked={locked} />
    </section>
  );
}
