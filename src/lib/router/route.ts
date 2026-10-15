import { ROUTER_CATALOG, routerModel, type RouterModel, type RouterRole } from "./catalog";

// ---------------------------------------------------------------------------
// Transparent routing + economics.
//
// Given a brief's signals the router proposes a staged route (SEARCH → CONTROL →
// SHIP → optional REPAIR → FINISH), always exposing for each stage the selected
// model, why it fits, its known failure mode, an alternative, the estimated
// attempts, the cost per attempt and the maximum authorized spend. Pure module:
// the same functions power the server render and the instant client recompute
// when the operator overrides a model.
// ---------------------------------------------------------------------------

export interface RouteInput {
  medium: "image" | "video";
  needsIdentity: boolean; // preserve product / face / character / logo
  needsText: boolean; // exact on-screen text / packaging
  talking: boolean; // talking / native-audio scene
  resolution: string | null;
  durationSec: number | null;
  deadlineDays: number;
  conceptCount: number; // SEARCH breadth, e.g. 8
  keep: number; // concepts chosen to carry forward, e.g. 2
  clientPrice: number;
  sourceFeePct: number; // 0..1
  contingencyPct: number; // 0..1
  targetMarginPct: number; // 0..1
}

export type StageKey = "search" | "control" | "ship" | "repair" | "finish";

export interface RouteStage {
  key: StageKey;
  role: RouterRole;
  title: string;
  why: string;
  selectedId: string;
  candidateIds: string[]; // selected first, then alternatives
  estimatedAttempts: number;
  optional: boolean;
}

export interface RoutePlan {
  pipeline: string[];
  stages: RouteStage[];
  input: RouteInput;
}

export interface PricedStage {
  key: StageKey;
  role: RouterRole;
  title: string;
  why: string;
  optional: boolean;
  estimatedAttempts: number;
  model: RouterModel;
  alternative: RouterModel | null;
  candidateIds: string[];
  costPerAttemptUsd: number;
  stageCost: number;
  maxAuthorizedSpend: number; // stageCost * (1 + contingency)
}

export interface RouteEconomics {
  stages: PricedStage[];
  estimatedSpend: number; // non-optional stages
  contingencyPct: number;
  maxAuthorizedSpend: number; // all stages incl. optional, + contingency
  netRevenue: number;
  expectedMargin: number; // net − maxAuthorizedSpend (worst case)
  expectedMarginPct: number;
  targetMarginPct: number;
  meetsTarget: boolean;
}

const round = (n: number) => Math.round(n * 100) / 100;

function score(m: RouterModel, input: RouteInput): number {
  let s = 0;
  if (input.needsText && m.controls.text) s += 3;
  if (input.needsIdentity && (m.controls.identity || m.controls.reference)) s += 3;
  if (input.talking && m.controls.audio) s += 4;
  return s;
}

/** Candidate models for a role, filtered by medium compatibility and ranked best-first. */
function candidates(role: RouterRole, input: RouteInput): RouterModel[] {
  const pool = ROUTER_CATALOG.filter((m) => m.role === role).filter((m) => {
    if (role === "search") return input.medium === "video" ? m.medium === "video" : m.medium === "image";
    if (role === "control") return m.medium === "image" || m.medium === "image_edit";
    if (role === "ship") return input.medium === "video" ? m.medium === "video" || m.medium === "audio_video" : m.medium === "image";
    return false;
  });
  return pool.sort((a, b) => {
    const ds = score(b, input) - score(a, input);
    if (ds !== 0) return ds;
    return role === "search" ? a.costPerAttemptUsd - b.costPerAttemptUsd : a.costPerAttemptUsd - b.costPerAttemptUsd;
  });
}

function finishCandidates(kind: "upscale" | "voice"): RouterModel[] {
  const media = kind === "upscale" ? ["upscale"] : ["voice", "lipsync"];
  return ROUTER_CATALOG.filter((m) => m.role === "finish" && media.includes(m.medium)).sort((a, b) => a.costPerAttemptUsd - b.costPerAttemptUsd);
}

export function proposeRoute(input: RouteInput): RoutePlan {
  const keep = Math.max(1, input.keep);
  const stages: RouteStage[] = [];

  const search = candidates("search", input);
  if (search.length) {
    stages.push({
      key: "search", role: "search", title: `Generate ${input.conceptCount} inexpensive concepts`,
      why: `Explore hooks and compositions cheaply before spending on control or final motion.`,
      selectedId: search[0].id, candidateIds: search.map((m) => m.id), estimatedAttempts: input.conceptCount, optional: false,
    });
  }

  const control = candidates("control", input);
  if (control.length) {
    const needs = [input.needsIdentity ? "identity/reference" : "", input.needsText ? "exact text/packaging" : ""].filter(Boolean).join(" and ");
    stages.push({
      key: "control", role: "control", title: `Make controlled keyframes from the ${keep} chosen concepts`,
      why: needs ? `Lock ${needs} before any motion spend.` : `Lock the look and layout before any motion spend.`,
      selectedId: control[0].id, candidateIds: control.map((m) => m.id), estimatedAttempts: keep * 3, optional: false,
    });
  }

  const ship = candidates("ship", input);
  if (ship.length) {
    stages.push({
      key: "ship", role: "ship", title: input.medium === "video" ? "Generate the final motion" : "Generate the final asset",
      why: input.talking ? "Premium talking / native-audio lane for the final cut." : input.medium === "video" ? "Premium motion/cinematic lane for the client-facing cut." : "Premium image lane for the final client-facing still.",
      selectedId: ship[0].id, candidateIds: ship.map((m) => m.id), estimatedAttempts: input.medium === "video" ? keep * 2 : keep, optional: false,
    });
    // Optional repair of a single continuity failure, on the same premium lane.
    stages.push({
      key: "repair", role: "ship", title: "Repair one continuity failure if needed",
      why: "Reserved budget to re-run a single shot that breaks continuity — only runs if QA flags it.",
      selectedId: ship[0].id, candidateIds: ship.map((m) => m.id), estimatedAttempts: 2, optional: true,
    });
  }

  if (input.talking) {
    const v = finishCandidates("voice");
    if (v.length) stages.push({ key: "finish", role: "finish", title: "Voice & lip sync", why: "Record/align the voice and sync it to picture.", selectedId: v[0].id, candidateIds: v.map((m) => m.id), estimatedAttempts: keep, optional: false });
  }
  const up = finishCandidates("upscale");
  if (up.length) {
    stages.push({
      key: "finish", role: "finish", title: "Upscale, grade & export (QA)",
      why: `Finish the ${keep} selected master(s)${input.resolution ? ` to ${input.resolution}` : ""} and hand to QA.`,
      selectedId: up[0].id, candidateIds: up.map((m) => m.id), estimatedAttempts: keep, optional: false,
    });
  }

  const pipeline = [
    `Generate ${input.conceptCount} inexpensive concepts`,
    `human chooses ${keep}`,
    "make controlled keyframes",
    input.medium === "video" ? "generate final motion" : "generate final asset",
    "repair one continuity failure if needed",
    "upscale",
    "QA",
  ];

  return { pipeline, stages, input };
}

export interface StageSelection {
  key: StageKey;
  selectedId: string;
  estimatedAttempts: number;
  optional: boolean;
  title: string;
  why: string;
  role: RouterRole;
  candidateIds: string[];
}

/** Price a set of stage selections. Pure — called on the server and again on every client override. */
export function priceRoute(
  selections: StageSelection[],
  econ: { clientPrice: number; sourceFeePct: number; contingencyPct: number; targetMarginPct: number },
): RouteEconomics {
  const stages: PricedStage[] = selections.map((sel) => {
    const model = routerModel(sel.selectedId) ?? ROUTER_CATALOG[0];
    const stageCost = round(model.costPerAttemptUsd * sel.estimatedAttempts);
    const alternative = sel.candidateIds.map(routerModel).find((m): m is RouterModel => !!m && m.id !== sel.selectedId) ?? null;
    return {
      key: sel.key, role: sel.role, title: sel.title, why: sel.why, optional: sel.optional,
      estimatedAttempts: sel.estimatedAttempts, model, alternative, candidateIds: sel.candidateIds,
      costPerAttemptUsd: model.costPerAttemptUsd, stageCost,
      maxAuthorizedSpend: round(stageCost * (1 + econ.contingencyPct)),
    };
  });
  const estimatedSpend = round(stages.filter((s) => !s.optional).reduce((a, s) => a + s.stageCost, 0));
  const allStagesCost = round(stages.reduce((a, s) => a + s.stageCost, 0));
  const maxAuthorizedSpend = round(allStagesCost * (1 + econ.contingencyPct));
  const netRevenue = round(econ.clientPrice * (1 - econ.sourceFeePct));
  const expectedMargin = round(netRevenue - maxAuthorizedSpend);
  const expectedMarginPct = econ.clientPrice > 0 ? expectedMargin / econ.clientPrice : -1;
  return {
    stages, estimatedSpend, contingencyPct: econ.contingencyPct, maxAuthorizedSpend,
    netRevenue, expectedMargin, expectedMarginPct, targetMarginPct: econ.targetMarginPct,
    meetsTarget: expectedMarginPct >= econ.targetMarginPct,
  };
}

/** Convenience: price the proposed route directly. */
export function pricePlan(plan: RoutePlan): RouteEconomics {
  const selections: StageSelection[] = plan.stages.map((s) => ({ key: s.key, selectedId: s.selectedId, estimatedAttempts: s.estimatedAttempts, optional: s.optional, title: s.title, why: s.why, role: s.role, candidateIds: s.candidateIds }));
  return priceRoute(selections, plan.input);
}
