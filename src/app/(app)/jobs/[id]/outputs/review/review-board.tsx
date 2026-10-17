"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AudioLines, Check, Columns2, EyeOff, Minus, Play, RotateCcw, SkipForward, TriangleAlert, X } from "lucide-react";
import { reviewGenerationAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { TakeReview } from "@/lib/domain/types";
import { VERDICT_LABEL, type QaReport, type QaStatus, type QaVerdict } from "@/lib/qa/qa";
import type { RepairDecision } from "@/lib/qa/repair";
import { cn, usd } from "@/lib/utils";

export interface BoardTake {
  id: string;
  attempt: number;
  modelLabel: string;
  prompt: string;
  cost: number;
  outputUrl: string | null;
  outputType: "image" | "video" | "audio" | null;
  reviewStatus: TakeReview;
  reviewNote: string | null;
  selected: boolean;
  createdAt: string;
  qa: { report: QaReport; repair: RepairDecision | null } | null;
}
export interface BoardGroup {
  key: string;
  title: string;
  purpose: string;
  takes: BoardTake[];
  /** Takes in this step that are still rendering, failed or cancelled — nothing to review yet. */
  unavailable: number;
}

type Flat = BoardTake & { groupKey: string };
type Local = Pick<BoardTake, "reviewStatus" | "reviewNote" | "selected">;

const REASONS = ["Off-brief", "Face or hand artefacts", "Motion issues", "Wrong text", "Wrong style", "Low quality"];
const MAX_COMPARE = 4;
const VERDICT_VARIANT: Record<QaVerdict, "ok" | "info" | "warn" | "bad"> = { delivery_review: "ok", concept: "info", controlled_edit: "warn", regenerate: "bad" };
const CHECK_STYLE: Record<QaStatus, { icon: React.ReactNode; cls: string }> = {
  pass: { icon: <Check className="size-3.5" />, cls: "text-ok" },
  warn: { icon: <TriangleAlert className="size-3.5" />, cls: "text-warn" },
  fail: { icon: <X className="size-3.5" />, cls: "text-bad" },
  na: { icon: <Minus className="size-3.5" />, cls: "text-muted-foreground" },
};

const isMock = (url: string) => url.startsWith("/api/mock-output");

function Media({ t, className, controls = true }: { t: BoardTake; className?: string; controls?: boolean }) {
  const url = t.outputUrl!;
  if (t.outputType === "video" && !isMock(url)) return <video src={url} className={className} controls={controls} muted playsInline preload="metadata" data-take-video />;
  if (t.outputType === "audio" && !isMock(url))
    return (
      <div className={cn("grid place-items-center bg-muted p-6", className)}>
        <audio src={url} controls className="w-full" />
      </div>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={`${t.modelLabel} take ${t.attempt}`} className={className} />;
}

function Thumb({ t }: { t: BoardTake }) {
  const url = t.outputUrl!;
  if (t.outputType === "audio" && !isMock(url)) return <div className="grid size-full place-items-center bg-muted text-muted-foreground"><AudioLines className="size-4" /></div>;
  if (t.outputType === "video" && !isMock(url)) return <video src={url} className="size-full object-cover" muted preload="metadata" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="size-full object-cover" loading="lazy" />;
}

function StatusBadge({ s }: { s: TakeReview }) {
  if (s === "approved") return <Badge variant="ok"><Check /> Approved</Badge>;
  if (s === "rejected") return <Badge variant="bad"><X /> Rejected</Badge>;
  return <Badge variant="outline">Not reviewed</Badge>;
}

function isTyping(el: EventTarget | null) {
  const n = el as HTMLElement | null;
  return !!n && (n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.tagName === "SELECT" || n.isContentEditable);
}

export function ReviewBoard({ jobId, groups }: { jobId: string; groups: BoardGroup[] }) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const [local, setLocal] = React.useState<Record<string, Local>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [hideReviewed, setHideReviewed] = React.useState(false);
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [compareIds, setCompareIds] = React.useState<string[]>([]);
  const [compareOn, setCompareOn] = React.useState(false);
  const compareRef = React.useRef<HTMLDivElement>(null);

  const merged = React.useMemo<Flat[]>(
    () => groups.flatMap((g) => g.takes.map((t) => ({ ...t, ...local[t.id], groupKey: g.key }))),
    [groups, local],
  );
  const byId = React.useMemo(() => new Map(merged.map((t) => [t.id, t])), [merged]);
  const [activeId, setActiveId] = React.useState<string>(() => (merged.find((t) => t.reviewStatus === "pending") ?? merged[0]).id);
  const active = byId.get(activeId) ?? merged[0];
  const group = groups.find((g) => g.key === active.groupKey)!;

  const reviewed = merged.filter((t) => t.reviewStatus !== "pending").length;
  const approved = merged.filter((t) => t.reviewStatus === "approved").length;

  const go = React.useCallback(
    (delta: number) => {
      const i = merged.findIndex((t) => t.id === activeId);
      const next = merged[Math.min(merged.length - 1, Math.max(0, i + delta))];
      if (next) {
        setActiveId(next.id);
        setRejecting(false);
      }
    },
    [merged, activeId],
  );

  const advance = React.useCallback(
    (fromId: string) => {
      const i = merged.findIndex((t) => t.id === fromId);
      const after = [...merged.slice(i + 1), ...merged.slice(0, i)];
      const next = after.find((t) => t.reviewStatus === "pending");
      if (next) setActiveId(next.id);
    },
    [merged],
  );

  const decide = React.useCallback(
    (t: Flat, status: TakeReview, reason: string | null, move = true) => {
      setError(null);
      setRejecting(false);
      setNote("");
      const before = local[t.id];
      setLocal((p) => ({ ...p, [t.id]: { reviewStatus: status, reviewNote: status === "pending" ? null : reason, selected: status === "approved" } }));
      if (move && status !== "pending") advance(t.id);
      startTransition(async () => {
        const r = await reviewGenerationAction(jobId, t.id, status, reason);
        if (!r.ok) {
          setError(r.error);
          setLocal((p) => {
            const n = { ...p };
            if (before) n[t.id] = before;
            else delete n[t.id];
            return n;
          });
        } else router.refresh();
      });
    },
    [advance, jobId, local, router],
  );

  const toggleCompare = React.useCallback(
    (t: Flat) => {
      setCompareIds((ids) => {
        const sameGroup = ids.filter((id) => byId.get(id)?.groupKey === t.groupKey);
        if (sameGroup.includes(t.id)) return sameGroup.filter((id) => id !== t.id);
        return [...sameGroup, t.id].slice(-MAX_COMPARE);
      });
    },
    [byId],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "arrowright" || k === "j") go(1);
      else if (k === "arrowleft" || k === "k") go(-1);
      else if (k === "a") decide(active, "approved", null);
      else if (k === "r") {
        e.preventDefault();
        setRejecting(true);
      } else if (k === "s") advance(active.id);
      else if (k === "u") decide(active, "pending", null, false);
      else if (k === "c") toggleCompare(active);
      else if (k === "escape") setRejecting(false);
      else return;
      if (k !== "r") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, advance, decide, go, toggleCompare]);

  const compareTakes = compareIds.map((id) => byId.get(id)).filter((t): t is Flat => !!t);
  const comparing = compareOn && compareTakes.length >= 2;
  const playAll = () => compareRef.current?.querySelectorAll<HTMLVideoElement>("video[data-take-video]").forEach((v) => { v.currentTime = 0; void v.play(); });

  const qa = active.qa;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
        <div className="flex min-w-48 flex-1 items-center gap-3">
          <Progress value={(reviewed / merged.length) * 100} className="max-w-56" indicatorClassName="bg-ok" />
          <span className="tnum text-[13px] text-muted-foreground">{reviewed}/{merged.length} reviewed · {approved} approved</span>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="xs" variant="outline" onClick={() => setHideReviewed((v) => !v)} aria-pressed={hideReviewed}>
            <EyeOff /> {hideReviewed ? "Show reviewed" : "Hide reviewed"}
          </Button>
          <Button asChild size="xs" variant={reviewed === merged.length ? "approve" : "outline"}>
            <Link href={`/jobs/${jobId}`}>Back to job</Link>
          </Button>
        </div>
      </div>
      {error ? <p className="rounded-md bg-bad-soft px-3 py-2 text-[12.5px] text-bad" role="alert">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_320px]">
        {/* steps + takes */}
        <nav aria-label="Takes" className="flex max-h-[78vh] flex-col gap-3 overflow-y-auto pr-1">
          {groups.map((g) => {
            const takes = merged.filter((t) => t.groupKey === g.key);
            const ap = takes.filter((t) => t.reviewStatus === "approved").length;
            const shown = hideReviewed ? takes.filter((t) => t.reviewStatus === "pending" || t.id === activeId) : takes;
            return (
              <section key={g.key} className="rounded-lg border bg-card p-2">
                <div className="flex items-start justify-between gap-2 px-1 pb-2">
                  <h2 className="text-[12px] font-semibold leading-snug">{g.title}</h2>
                  {takes.length ? (
                    <Badge variant={ap === 0 ? "warn" : ap > 1 ? "info" : "ok"} title="Approved takes in this step" className="tnum">
                      {ap === 0 ? "No pick" : `${ap} picked`}
                    </Badge>
                  ) : null}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {shown.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { setActiveId(t.id); setRejecting(false); }}
                      aria-current={t.id === activeId}
                      aria-label={`Take ${t.attempt}, ${t.reviewStatus}`}
                      data-take={t.id}
                      className={cn(
                        "relative aspect-video overflow-hidden rounded border bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        t.id === activeId && "ring-2 ring-foreground ring-offset-1 ring-offset-background",
                        t.reviewStatus === "rejected" && "opacity-50",
                      )}
                    >
                      <Thumb t={t} />
                      <span className="tnum absolute left-0.5 top-0.5 rounded bg-background/80 px-1 text-[10px]">#{t.attempt}</span>
                      {t.reviewStatus !== "pending" ? (
                        <span className={cn("absolute bottom-0.5 right-0.5 grid size-4 place-items-center rounded-full text-white", t.reviewStatus === "approved" ? "bg-ok" : "bg-bad")}>
                          {t.reviewStatus === "approved" ? <Check className="size-3" /> : <X className="size-3" />}
                        </span>
                      ) : null}
                      {compareIds.includes(t.id) ? <span className="absolute bottom-0.5 left-0.5 grid size-4 place-items-center rounded-full bg-info text-white"><Columns2 className="size-2.5" /></span> : null}
                    </button>
                  ))}
                </div>
                {g.unavailable ? <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">{g.unavailable} not available (rendering, failed or cancelled)</p> : null}
              </section>
            );
          })}
        </nav>

        {/* main stage */}
        <div className="flex min-w-0 flex-col gap-3">
          <section className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{group.title} <span className="font-normal text-muted-foreground">· take #{active.attempt}</span></p>
                <p className="truncate text-[11.5px] text-muted-foreground">{active.modelLabel} · {usd(active.cost, { cents: true })}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge s={active.reviewStatus} />
                <Button type="button" size="xs" variant={compareIds.includes(active.id) ? "secondary" : "outline"} onClick={() => toggleCompare(active)} aria-pressed={compareIds.includes(active.id)}>
                  <Columns2 /> {compareIds.includes(active.id) ? "In compare" : "Compare"}
                </Button>
              </div>
            </div>

            {compareIds.length ? (
              <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2 text-[12px]">
                <span className="text-muted-foreground">{compareTakes.length} take(s) marked for compare{compareTakes.length < 2 ? " — mark at least two in this step" : ""}</span>
                <Button type="button" size="xs" variant={comparing ? "secondary" : "outline"} disabled={compareTakes.length < 2} onClick={() => setCompareOn((v) => !v)}>
                  {comparing ? "Single view" : "Compare side by side"}
                </Button>
                {comparing ? <Button type="button" size="xs" variant="outline" onClick={playAll}><Play /> Play all</Button> : null}
                <Button type="button" size="xs" variant="ghost" onClick={() => { setCompareIds([]); setCompareOn(false); }}>Clear</Button>
              </div>
            ) : null}

            {comparing ? (
              <div ref={compareRef} className="grid gap-px bg-border sm:grid-cols-2">
                {compareTakes.map((t) => (
                  <div key={t.id} className="flex flex-col bg-card">
                    <div className="grid place-items-center bg-muted/60">
                      <Media t={t} className="max-h-[42vh] w-full object-contain" />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <button type="button" className="min-w-0 text-left text-[12px] font-medium hover:underline" onClick={() => { setActiveId(t.id); setCompareOn(false); }}>
                        #{t.attempt} <span className="font-normal text-muted-foreground">{t.modelLabel}</span>
                      </button>
                      <div className="flex flex-wrap items-center gap-1">
                        {t.qa ? <Badge variant={VERDICT_VARIANT[t.qa.report.verdict]} className="whitespace-normal text-left">{VERDICT_LABEL[t.qa.report.verdict]}</Badge> : null}
                        <Button type="button" size="xs" variant={t.reviewStatus === "approved" ? "approve" : "outline"} onClick={() => decide(t, t.reviewStatus === "approved" ? "pending" : "approved", null, false)} aria-label={`Approve take ${t.attempt}`}>
                          <Check /> {t.reviewStatus === "approved" ? "Picked" : "Pick"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid place-items-center bg-muted/60">
                <Media key={active.id} t={active} className="max-h-[60vh] w-full object-contain" />
              </div>
            )}

            {/* decision bar */}
            {!comparing ? (
              <div className="border-t px-4 py-3">
                {rejecting ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-[12px] font-medium">Why reject take #{active.attempt}? <span className="font-normal text-muted-foreground">Pick a reason or write your own — it is kept with the take.</span></p>
                    <div className="flex flex-wrap gap-1.5">
                      {REASONS.map((r) => (
                        <Button key={r} type="button" size="xs" variant="outline" onClick={() => decide(active, "rejected", r)}>{r}</Button>
                      ))}
                    </div>
                    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); decide(active, "rejected", note.trim() || null); }}>
                      <input
                        autoFocus
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={500}
                        placeholder="Other reason (optional) — Enter to reject, Esc to cancel"
                        onKeyDown={(e) => { if (e.key === "Escape") setRejecting(false); }}
                        className="h-8 flex-1 rounded-md border bg-card px-2 text-[13px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      />
                      <Button type="submit" size="sm" variant="destructive"><X /> Reject</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
                    </form>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="approve" size="sm" onClick={() => decide(active, "approved", null)} disabled={active.reviewStatus === "approved"}>
                      <Check /> Approve <kbd className="text-[10px] opacity-70">A</kbd>
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setRejecting(true)} disabled={active.reviewStatus === "rejected"}>
                      <X /> Reject <kbd className="text-[10px] opacity-60">R</kbd>
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => advance(active.id)}>
                      <SkipForward /> Skip <kbd className="text-[10px] opacity-60">S</kbd>
                    </Button>
                    {active.reviewStatus !== "pending" ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => decide(active, "pending", null, false)}>
                        <RotateCcw /> Undo <kbd className="text-[10px] opacity-60">U</kbd>
                      </Button>
                    ) : null}
                    {active.reviewNote ? <span className="text-[12px] text-muted-foreground">“{active.reviewNote}”</span> : null}
                  </div>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">← → or J K to move between takes · A approve · R reject · S skip · U undo · C compare</p>
              </div>
            ) : null}
          </section>
        </div>

        {/* QA + details */}
        <aside className="flex min-w-0 flex-col gap-3 lg:col-span-2 xl:col-span-1">
          <section className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold">Automated QA</h2>
              {qa ? <Badge variant={VERDICT_VARIANT[qa.report.verdict]}>{VERDICT_LABEL[qa.report.verdict]}</Badge> : null}
            </div>
            {qa ? (
              <>
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">{qa.report.summary}</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {qa.report.checks.map((c) => (
                    <li key={c.id} className="flex gap-2 text-[12.5px]">
                      <span className={cn("mt-0.5 shrink-0", CHECK_STYLE[c.status].cls)} aria-label={c.status}>{CHECK_STYLE[c.status].icon}</span>
                      <span className="min-w-0">
                        <span className="font-medium">{c.label}</span>
                        {c.heuristic ? <span className="ml-1.5 rounded bg-muted px-1 text-[10px] text-muted-foreground" title="Simulated check — there is no vision model behind it">heuristic</span> : null}
                        <span className="block text-muted-foreground">{c.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {qa.repair ? (
                  <div className="mt-3 rounded-md border bg-muted/40 p-2.5 text-[12px]">
                    <p className="font-medium">Suggested repair · {usd(qa.repair.incrementalCostUsd, { cents: true })}</p>
                    <p className="mt-0.5 text-muted-foreground">{qa.repair.reason}</p>
                    <p className="mt-1 text-muted-foreground">
                      {qa.repair.auto ? "Within your pre-approved repair limits." : `Needs your approval${qa.repair.blockedBy ? ` — over ${qa.repair.blockedBy}` : ""}.`} Margin after: {Math.round(qa.repair.newMarginPct * 100)}%.
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-1.5 text-[12.5px] text-muted-foreground">No QA report for this take.</p>
            )}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="text-[13px] font-semibold">Prompt</h2>
            <p className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-[12.5px] text-muted-foreground">{active.prompt}</p>
            <p className="tnum mt-2 text-[11px] text-muted-foreground">{active.modelLabel} · {usd(active.cost, { cents: true })}</p>
            {active.outputUrl ? (
              <a href={active.outputUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                Open original
              </a>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
