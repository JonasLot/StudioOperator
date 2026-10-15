import { FileText, Quote } from "lucide-react";
import { AnalyzeButton } from "./job-actions";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BriefAnalysis, Job } from "@/lib/domain/types";
import { SOURCE_LABEL } from "@/lib/domain/types";
import { dateTime, shortDate, usd } from "@/lib/utils";
import { Dl, ListOrEmpty, Section } from "./section";

export function BriefTab({ job, analysis }: { job: Job; analysis: BriefAnalysis | null }) {
  return (
    <div className="flex flex-col gap-4">
      {!analysis ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed bg-card px-4 py-3">
          <div>
            <p className="text-sm font-medium">Not analysed yet</p>
            <p className="text-[13px] text-muted-foreground">Run analysis to extract requirements, decide, plan production and estimate cost.</p>
          </div>
          <AnalyzeButton jobId={job.id} label="Analyse brief" />
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Section title={<span className="inline-flex items-center gap-2"><FileText className="size-4 text-muted-foreground" strokeWidth={1.6} /> Client brief</span>} aside={<span className="rounded-md bg-muted px-2 py-1 text-[11.5px] text-muted-foreground">Manually added</span>}>
          <p className="max-h-[480px] overflow-auto whitespace-pre-wrap text-[15px] leading-[1.75] text-foreground/85">{job.rawBrief}</p>
          <div className="mt-5 flex justify-between border-t pt-4 text-[12.5px] text-muted-foreground"><span>Received {dateTime(job.createdAt)}</span><span>{SOURCE_LABEL[job.source]}</span></div>
        </Section>
        <Section title="Intake">
          <Dl
            items={[
              ["Source", SOURCE_LABEL[job.source]],
              ["Client", job.clientName ?? "—"],
              ["Client price", <span key="b" className="tnum">{usd(job.budget)}</span>],
              ["Deadline", shortDate(job.deadline)],
              ["Received", dateTime(job.createdAt)],
              ["References", job.referenceAssets.length ? (
                <ul key="r" className="flex flex-col gap-0.5">
                  {job.referenceAssets.map((r) => (
                    <li key={r} className="truncate text-[12px]" title={r}>{r}</li>
                  ))}
                </ul>
              ) : "—"],
            ]}
          />
          {job.clientNotes ? (
            <div className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-[12.5px]">
              <div className="mb-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">Private notes</div>
              {job.clientNotes}
            </div>
          ) : null}
        </Section>
      </div>

      {analysis ? (
        <>
          <Section
            title="Structured requirements"
            aside={
              <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {analysis.analyzer} · {dateTime(analysis.createdAt)}
              </span>
            }
          >
            <p className="mb-3 text-[13px]">{analysis.summary}</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Deliverable</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Aspect</TableHead>
                  <TableHead>Resolution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analysis.deliverables.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">No deliverables identified.</TableCell>
                  </TableRow>
                ) : null}
                {analysis.deliverables.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{d.id}</TableCell>
                    <TableCell>
                      <span className="font-medium">{d.title}</span> <Badge variant="outline" className="ml-1">{d.kind}</Badge>
                    </TableCell>
                    <TableCell className="tnum">{d.quantity}</TableCell>
                    <TableCell className="tnum">{d.durationSec ? `${d.durationSec}s` : "—"}</TableCell>
                    <TableCell>{d.aspectRatio ?? "—"}</TableCell>
                    <TableCell>{d.resolution ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <div className="grid gap-4 md:grid-cols-2">
            <Section title="Exact text" aside={<span className="text-[11px] text-muted-foreground">rendered verbatim</span>}>
              <ListOrEmpty
                items={analysis.exactText}
                empty="No verbatim copy requested."
                render={(s) => (
                  <span className="flex items-start gap-2">
                    <Quote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12.5px]">{s}</code>
                  </span>
                )}
              />
            </Section>
            <Section title="Dimensions & durations">
              <div className="flex flex-wrap gap-1.5">
                {[...analysis.dimensions, ...analysis.durations].length === 0 ? <span className="text-[13px] text-muted-foreground">None specified.</span> : null}
                {analysis.dimensions.map((x) => (
                  <Badge key={x} variant="secondary" className="text-xs">{x}</Badge>
                ))}
                {analysis.durations.map((x) => (
                  <Badge key={x} variant="outline" className="text-xs">{x}</Badge>
                ))}
              </div>
            </Section>
            <Section title="Brand constraints">
              <ListOrEmpty items={analysis.brandConstraints} empty="No brand constraints given." />
            </Section>
            <Section title="References">
              <ListOrEmpty items={analysis.references} empty="No references provided." render={(s) => <span className="min-w-0 break-words">{s}</span>} />
            </Section>
          </div>
        </>
      ) : null}
    </div>
  );
}
