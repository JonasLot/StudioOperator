import "server-only";
import { config } from "@/lib/config";
import type { BriefAnalysis, Deliverable, Generation, Job, WorkflowStep } from "@/lib/domain/types";
import { getModel } from "@/lib/higgsfield/catalog";
import { assessOutput, primaryIssue, type PerceptualKind, type QaInput, type QaReport, type QaVerdict } from "@/lib/qa/qa";
import { decideRepair, type RepairDecision } from "@/lib/qa/repair";
import { getRepo } from "@/lib/repo";
import { computeProfitability, generationSpend } from "./economics";

export interface JobQaOutput {
  generationId: string;
  stepName: string;
  deliverable: string;
  modelLabel: string;
  report: QaReport;
  repair: RepairDecision | null;
}
export interface JobQa {
  outputs: JobQaOutput[];
  overallVerdict: QaVerdict | null;
  autoRepairable: number;
  needsApproval: number;
  limits: { perRepairMaxUsd: number; perJobRepairMaxUsd: number; maxAutoRepairsPerJob: number };
}

const VERDICT_RANK: Record<QaVerdict, number> = { delivery_review: 0, concept: 1, controlled_edit: 2, regenerate: 3 };

function deliverableType(kind: Deliverable["kind"]): "video" | "image" | "audio" {
  if (kind === "still") return "image";
  if (kind === "voiceover") return "audio";
  return "video";
}

/**
 * The modality a given step actually produces. A look-development step outputs
 * keyframe images even on a video job, so QA must grade it as an image — not
 * against the final video deliverable's type.
 */
function stepOutputType(step: WorkflowStep, deliverable: Deliverable | null, fallback: "video" | "image" | "audio"): "video" | "image" | "audio" {
  switch (step.category) {
    case "image":
      return "image";
    case "voice":
      return "audio";
    case "video":
      return "video";
    default: // editing / finishing → the delivered artefact's own modality
      return deliverable ? deliverableType(deliverable.kind) : fallback;
  }
}

function clausesMatching(text: string, re: RegExp, limit: number): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 6 && re.test(s))
    .slice(0, limit);
}

function perceptualFor(type: "video" | "image" | "audio", brief: string): PerceptualKind[] {
  const ks: PerceptualKind[] = [];
  const peopleMentioned = /\b(face|person|people|hiker|model|character|portrait|talent|actor|dancer|crowd)\b/i.test(brief);
  // An explicit "no people" / "without faces" brief must NOT trigger face/hand checks.
  const peopleExcluded = /\bno (?:people|faces?|humans?|persons?|characters?|actors?)\b|\bwithout (?:people|faces?|humans?|characters?)\b/i.test(brief);
  const people = peopleMentioned && !peopleExcluded;
  if (type === "video") {
    ks.push("motion", "continuity");
    if (people) ks.push("face", "hand");
    if (/\b(voice|vo|narrat|dialogue|talking|lip)\b/i.test(brief)) ks.push("audio", "lipsync");
  } else if (type === "image") {
    if (people) ks.push("face", "hand");
  } else if (type === "audio") {
    ks.push("audio");
  }
  return ks;
}

function buildInput(job: Job, analysis: BriefAnalysis, gen: Generation, deliverable: Deliverable | null, step: WorkflowStep): QaInput {
  const type = stepOutputType(step, deliverable, gen.outputType ?? "image");
  const briefText = `${analysis.summary}\n${job.rawBrief}`;
  const prohibited = clausesMatching(briefText, /\b(no|never|avoid|do not|don'?t|without)\b/i, 4);
  const requiredScenes = clausesMatching(briefText, /\b(show|scene|shot of|depict|transition|cross(?:es)?|reaches|ignites|arc|times of day)\b/i, 4);
  const want = deliverable?.aspectRatio ?? analysis.dimensions.find((d) => d.includes(":")) ?? null;
  return {
    deliverableName: deliverable?.title ?? gen.model,
    deliverableType: type,
    gotType: gen.outputType ?? type, // mock produces to spec
    wantAspectRatios: [deliverable?.aspectRatio, ...analysis.dimensions.filter((d) => d.includes(":"))].filter((x): x is string => !!x),
    gotAspectRatio: want,
    wantResolution: deliverable?.resolution ?? analysis.dimensions.find((d) => /\d{3,4}|4K|8K/i.test(d)) ?? null,
    gotResolution: deliverable?.resolution ?? null,
    wantDurationSec: deliverable?.durationSec ?? null,
    gotDurationSec: deliverable?.durationSec ?? null,
    exactText: type === "video" || deliverable?.kind === "still" ? analysis.exactText : [],
    brandConstraints: analysis.brandConstraints,
    prohibited,
    requiredScenes,
    relevantPerceptual: perceptualFor(type, briefText),
    seed: gen.id,
  };
}

/** Compute QA for a job's completed outputs (one per selected/first-usable take per step). Read-only + deterministic. */
export function jobQa(jobId: string): JobQa {
  const repo = getRepo();
  const job = repo.getJob(jobId);
  const analysis = repo.getLatestAnalysis(jobId);
  const workflow = repo.getCurrentWorkflow(jobId);
  const generations = repo.listGenerations(jobId);
  const limits = { perRepairMaxUsd: config.qa.perRepairMaxUsd, perJobRepairMaxUsd: config.qa.perJobRepairMaxUsd, maxAutoRepairsPerJob: config.qa.maxAutoRepairsPerJob };
  if (!job || !analysis || !workflow) return { outputs: [], overallVerdict: null, autoRepairable: 0, needsApproval: 0, limits };

  const p = computeProfitability(job, workflow, generations, repo.listRevisions(jobId));
  const jobRepairSpentUsd = generations.filter((g) => g.revisionId).reduce((a, g) => a + generationSpend(g), 0);
  const autoRepairsSoFar = new Set(generations.filter((g) => g.revisionId).map((g) => g.revisionId)).size;
  const remainingCapUsd = (workflow.maxBudget ?? job.budget) - p.committedSpend;

  // One representative completed output per step (prefer the selected take).
  const outputs: JobQaOutput[] = [];
  for (const step of workflow.steps) {
    const stepGens = generations.filter((g) => g.stepId === step.id && !g.revisionId && g.status === "completed");
    const gen = stepGens.find((g) => g.selected) ?? stepGens[0];
    if (!gen) continue;
    const deliverable = analysis.deliverables.find((d) => step.deliverableIds.includes(d.id)) ?? analysis.deliverables[0] ?? null;
    const report = assessOutput(buildInput(job, analysis, gen, deliverable, step));
    let repair: RepairDecision | null = null;
    if (report.verdict === "controlled_edit" || report.verdict === "regenerate") {
      const issue = primaryIssue(report);
      const model = getModel(gen.model);
      repair = decideRepair(report, issue ? `${issue.label}: ${issue.detail}` : report.summary, {
        modelId: model.id, modelLabel: model.label, unitCostUsd: model.unitCostUsd, attempts: config.qa.repairAttempts,
        jobRepairSpentUsd, autoRepairsSoFar, priorTotalUsd: p.committedSpend, clientPriceUsd: job.budget, netRevenueUsd: p.netRevenue, remainingCapUsd,
      }, limits);
    }
    outputs.push({ generationId: gen.id, stepName: step.name, deliverable: deliverable?.title ?? step.name, modelLabel: getModel(gen.model).label, report, repair });
  }

  const overallVerdict = outputs.length ? outputs.map((o) => o.report.verdict).sort((a, b) => VERDICT_RANK[b] - VERDICT_RANK[a])[0] : null;
  return {
    outputs,
    overallVerdict,
    autoRepairable: outputs.filter((o) => o.repair?.auto).length,
    needsApproval: outputs.filter((o) => o.repair?.needsApproval).length,
    limits,
  };
}
