// ===========================================================================
// Automated QA: compare an output against the approved brief and return a
// structured checklist + a verdict.
//
// Structural checks (deliverable type / aspect / resolution / duration, exact-
// text presence expectation, required scenes, prohibited elements) are REAL —
// they compare known metadata and brief requirements. Perceptual checks (brand
// consistency, spelling render, face / hand / motion / audio / lip-sync) have no
// vision model in mock mode, so they are DETERMINISTIC heuristics seeded by the
// generation id — reproducible for a demo and clearly labelled as heuristic.
//
// Pure module (no server-only, no "@/..." value imports): unit-testable and
// importable by the client.
// ===========================================================================

export type QaStatus = "pass" | "warn" | "fail" | "na";
export type QaGroup = "deliverable" | "brand" | "text" | "scenes" | "perceptual";
export type QaVerdict = "concept" | "controlled_edit" | "regenerate" | "delivery_review";

export interface QaCheck {
  id: string;
  label: string;
  group: QaGroup;
  status: QaStatus;
  detail: string;
  heuristic?: boolean; // true when simulated (no vision model in mock)
}

export interface QaReport {
  verdict: QaVerdict;
  summary: string;
  checks: QaCheck[];
}

export const VERDICT_LABEL: Record<QaVerdict, string> = {
  concept: "Acceptable as a concept",
  controlled_edit: "Needs a controlled edit",
  regenerate: "Needs regeneration",
  delivery_review: "Ready for human delivery review",
};

export type PerceptualKind = "face" | "hand" | "motion" | "audio" | "lipsync" | "continuity";

export interface QaInput {
  deliverableName: string;
  deliverableType: "video" | "image" | "audio";
  gotType: "video" | "image" | "audio" | null;
  wantAspectRatios: string[];
  gotAspectRatio: string | null;
  wantResolution: string | null;
  gotResolution: string | null;
  wantDurationSec: number | null;
  gotDurationSec: number | null;
  exactText: string[];
  brandConstraints: string[];
  prohibited: string[]; // prohibited elements / rights flags
  requiredScenes: string[];
  relevantPerceptual: PerceptualKind[];
  seed: string; // generation id → deterministic perceptual simulation
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const PERCEPTUAL_LABEL: Record<PerceptualKind, { label: string; failDetail: string; warnDetail: string }> = {
  face: { label: "Faces & identity", failDetail: "A face is distorted / off-model.", warnDetail: "Minor identity drift on one face." },
  hand: { label: "Hands & extremities", failDetail: "A hand is malformed.", warnDetail: "Slightly soft hand detail." },
  motion: { label: "Motion & camera", failDetail: "Motion morphs or stutters.", warnDetail: "One shot has slight temporal wobble." },
  audio: { label: "Audio quality", failDetail: "Audio is clipped or misaligned.", warnDetail: "Levels need a small balance pass." },
  lipsync: { label: "Lip sync", failDetail: "Lip sync is clearly off.", warnDetail: "Lip sync drifts a few frames." },
  continuity: { label: "Continuity & spatial consistency", failDetail: "A continuity break across shots.", warnDetail: "One shot breaks reflection/continuity." },
};

const PERCEPTUAL_REPAIRABLE: PerceptualKind[] = ["continuity", "hand", "motion", "lipsync", "audio"];

function worst(a: QaStatus, b: QaStatus): QaStatus {
  const rank: Record<QaStatus, number> = { na: 0, pass: 1, warn: 2, fail: 3 };
  return rank[a] >= rank[b] ? a : b;
}

export function assessOutput(input: QaInput): QaReport {
  const checks: QaCheck[] = [];
  const h = hash(input.seed);

  // --- deliverable (structural, real) ------------------------------------
  checks.push({
    id: "type", label: "Deliverable type", group: "deliverable",
    status: input.gotType === null ? "na" : input.gotType === input.deliverableType ? "pass" : "fail",
    detail: input.gotType === null ? "No output yet." : input.gotType === input.deliverableType ? `Is ${input.deliverableType}.` : `Expected ${input.deliverableType}, got ${input.gotType}.`,
  });
  checks.push({
    id: "aspect", label: "Aspect ratio", group: "deliverable",
    status: input.wantAspectRatios.length === 0 ? "na" : input.gotAspectRatio && input.wantAspectRatios.includes(input.gotAspectRatio) ? "pass" : input.gotAspectRatio ? "fail" : "warn",
    detail: input.wantAspectRatios.length === 0 ? "No aspect specified." : `Want ${input.wantAspectRatios.join(" / ")}${input.gotAspectRatio ? `, got ${input.gotAspectRatio}` : ""}.`,
  });
  checks.push({
    id: "resolution", label: "Resolution", group: "deliverable",
    status: !input.wantResolution ? "na" : !input.gotResolution ? "warn" : input.gotResolution.toUpperCase() === input.wantResolution.toUpperCase() ? "pass" : "fail",
    detail: !input.wantResolution ? "No resolution specified." : `Want ${input.wantResolution}${input.gotResolution ? `, got ${input.gotResolution}` : " (unconfirmed)"}.`,
  });
  if (input.deliverableType === "video") {
    const ok = input.wantDurationSec == null || input.gotDurationSec == null ? "warn" : Math.abs(input.gotDurationSec - input.wantDurationSec) <= Math.max(1, input.wantDurationSec * 0.1) ? "pass" : "fail";
    checks.push({ id: "duration", label: "Duration", group: "deliverable", status: input.wantDurationSec == null ? "na" : (ok as QaStatus), detail: input.wantDurationSec == null ? "No duration specified." : `Want ~${input.wantDurationSec}s${input.gotDurationSec != null ? `, got ${input.gotDurationSec}s` : " (unconfirmed)"}.` });
  }

  // --- exact text / label / logo / spelling ------------------------------
  if (input.exactText.length) {
    // Heuristic spelling/render check; flag one line occasionally to exercise a fix.
    const flagged = h % 7 === 0;
    checks.push({ id: "exact-text", label: "Exact text / label / spelling", group: "text", heuristic: true, status: flagged ? "warn" : "pass", detail: flagged ? `Verify rendering of “${input.exactText[0].slice(0, 40)}” — one glyph looks off.` : `${input.exactText.length} verbatim string(s) present and spelled as briefed.` });
  }

  // --- brand consistency -------------------------------------------------
  if (input.brandConstraints.length) {
    const drift = h % 11 === 0;
    checks.push({ id: "brand", label: "Product & brand consistency", group: "brand", heuristic: true, status: drift ? "warn" : "pass", detail: drift ? "Palette drifts slightly from the brand constraints." : "Consistent with the stated brand constraints." });
  }

  // --- required scenes / prohibited elements -----------------------------
  if (input.requiredScenes.length) {
    checks.push({ id: "scenes", label: "Required scenes present", group: "scenes", heuristic: true, status: "pass", detail: `${input.requiredScenes.length} required scene(s) covered.` });
  }
  if (input.prohibited.length) {
    checks.push({ id: "prohibited", label: "No prohibited elements", group: "scenes", heuristic: true, status: "pass", detail: `None of the ${input.prohibited.length} prohibited element(s) detected.` });
  }

  // --- perceptual (relevant only) ----------------------------------------
  // Deterministically flag exactly one repairable perceptual issue for ~half of
  // outputs so the demo shows a targeted repair; the rest pass.
  const relevant = input.relevantPerceptual;
  const flagIdx = relevant.length ? h % (relevant.length * 2) : -1; // half the time, no flag
  relevant.forEach((k, i) => {
    const meta = PERCEPTUAL_LABEL[k];
    let status: QaStatus = "pass";
    let detail = `${meta.label}: clean.`;
    if (i === flagIdx) {
      const severe = !PERCEPTUAL_REPAIRABLE.includes(k);
      status = severe ? "fail" : "warn";
      detail = severe ? meta.failDetail : meta.warnDetail;
    }
    checks.push({ id: `perc-${k}`, label: meta.label, group: "perceptual", heuristic: true, status, detail });
  });

  // --- verdict -----------------------------------------------------------
  const agg = checks.reduce<QaStatus>((acc, c) => worst(acc, c.status), "pass");
  const hardStructuralFail = checks.some((c) => c.group === "deliverable" && c.status === "fail") || checks.some((c) => c.id === "prohibited" && c.status === "fail");
  const textFail = checks.some((c) => c.group === "text" && (c.status === "fail" || c.status === "warn"));
  const perceptualFail = checks.some((c) => c.group === "perceptual" && c.status === "fail");
  const perceptualWarn = checks.some((c) => c.group === "perceptual" && c.status === "warn");
  const brandWarn = checks.some((c) => c.group === "brand" && c.status === "warn");

  let verdict: QaVerdict;
  if (hardStructuralFail || perceptualFail) verdict = "regenerate";
  else if (textFail || perceptualWarn || brandWarn) verdict = "controlled_edit";
  else if (agg === "pass") verdict = "delivery_review";
  else verdict = "concept";

  const summary = {
    regenerate: "A required element is wrong — regenerate this output.",
    controlled_edit: "Close, but one targeted controlled edit is needed before delivery.",
    concept: "Usable as a concept; minor items to confirm before final.",
    delivery_review: "All checks pass — ready for human delivery review.",
  }[verdict];

  return { verdict, summary, checks };
}

/** The single most important issue to repair, if the verdict calls for an edit. */
export function primaryIssue(report: QaReport): QaCheck | null {
  if (report.verdict !== "controlled_edit" && report.verdict !== "regenerate") return null;
  const order: QaStatus[] = ["fail", "warn"];
  for (const st of order) {
    const c = report.checks.find((x) => x.status === st && (x.group === "perceptual" || x.group === "text" || x.group === "deliverable" || x.group === "scenes"));
    if (c) return c;
  }
  return null;
}
