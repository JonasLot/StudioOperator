import "server-only";
import { getRepo } from "@/lib/repo";
import { loadRuntimeConfig } from "@/lib/runtime-config";
import * as agency from "@/lib/services/agency";
import { audit } from "@/lib/services/audit";
import {
  addRevision,
  approveFinalDelivery,
  approveInitialWorkflow,
  clearRights,
  createJob,
  runRevision,
  startProduction,
  tick,
} from "@/lib/services/studio";

const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export const SEED_BRIEFS = {
  aurora: `Northlight Outdoor — "Aurora" concept film

We're launching our winter shell jacket line (Northlight Polar Series) and need a cinematic 60-second concept film plus two 15s cutdowns for Instagram Reels at 9:16. Main film is 16:9, delivered in 4K.

Story: a lone hiker crosses a frozen fjord at blue hour, the aurora ignites overhead, and she reaches a ridge cabin as the light peaks. No dialogue. Voiceover only at the very end.

Look: anamorphic, 35mm grain, cold teal shadows with warm amber practicals. Reference: our moodboard https://example.com/northlight/moodboard and the Polar Series lookbook PDF.

Brand: logo end card on black, use our wordmark only, never place the logo over footage. Palette is glacier white, slate and signal orange. Do not show competitor gear.

End card text must read exactly: "Built for the long night." followed by "Northlight Polar Series — Available 1 November".

Voiceover: calm female narrator, reads the end line only.
Music: atmospheric score, we license it ourselves from our music library.
Usage: paid social and web, Nordics + UK, 12 months. Two revision rounds included.`,

  bakery: `Need a 15 second looping video for our bakery's new sourdough, 9:16 for TikTok. Make it in the style of Wes Anderson — symmetrical, pastel, quirky. Use the song by Vampire Weekend we love (Harmony Hall). Text on screen: "Slow bread. Fast mornings." Quick turnaround please!`,

  coffee: `Fjord Coffee — new cold brew can. We need six product stills for the web shop, 4:5, studio light on wet slate with fresh condensation on the can. Brand colours are deep navy and copper; the logo must be legible and never cropped. Reference: last season's shoot (attached). Usage: web shop and organic social, no expiry. One revision round included.`,

  crypto: `Make a 20 second video where the president endorses my crypto token. Make it look like the president is really saying it — fake endorsement is fine, it's just for hype. Need it tomorrow.`,

  podcast: `Podcast "Signal & Noise", season 3 launch. Three cover art stills (1:1) plus a 20s vertical teaser at 9:16 with a voiceover reading the episode title: "Episode 1: The Quiet Machines". Brand palette is black and electric lime, logo bottom-left. Usage: podcast platforms and social, worldwide. Two revisions included. Moodboard: https://example.com/signal-noise/s3`,

  library: `Hi! Referral from Maria at Vestland Arkitekter. We're an architecture firm in Bergen and want a short film showing our new public library at different times of day, for a competition submission. We have renders and photos. Budget is flexible-ish. Can you help?`,

  glassMonument: `After the Rain: Glass Monument — cinematic brand film.

We need one short cinematic film delivered in both 9:16 and 16:9 (4K masters), plus three approved keyframes.

Weather arc / story: a translucent glass monument stands on an open plaza as a storm passes — heavy rain first, then the clouds break and a low sun ignites the wet glass and the reflections in the standing water. No people.

Scenes to show: the monument in the rain; the transition as the storm clears; reflections and the water settling after the rain.

We are providing: an approved monument silhouette and reference, glass-material references, site direction, weather-arc notes, visual references, and examples we like and dislike.

Constraints: the monument's architecture, material, scale and site must stay consistent across every shot. Water, reflections and the after-storm transition must remain believable. Do not change the monument design. Do not show people. Do not show competitor buildings.

Deadline: 72 hours. Two revision rounds included. Music is licensed by us.`,

  nightOrchard: `Night Orchard: Slow Orbit.

Deliver one atmospheric short sequence built around a single smooth orbiting camera move through a night orchard, plus one hero still. 16:9, 1080p.

We are providing: an approved orchard-world keyframe, a low-light palette, camera direction (a slow 180° orbit), a pacing reference, and the delivery format.

Constraints: preserve the orchard world, its depth, low-light detail and spatial continuity throughout the orbit. No text on screen. No people.

Deadline: 5 days. One revision round included.`,
};

/** Drive the mock provider to completion instantly by back-dating in-flight work. */
async function fastForward(jobId: string, until: (status: string) => boolean, maxRounds = 40) {
  const repo = getRepo();
  for (let i = 0; i < maxRounds; i++) {
    const job = (await repo.getJob(jobId))!;
    if (until(job.status)) return;
    // Back-date just past the mock render window so the mock completes this tick,
    // but not so far that the application-level polling timeout would trip.
    for (const gen of (await repo.listGenerations(jobId)).filter((x) => x.status === "queued" || x.status === "in_progress")) {
      await repo.updateGeneration(gen.id, { startedAt: new Date(Date.now() - 10_000).toISOString() });
    }
    // The demo operator approves each finished step's picked take so the next step may start.
    const wf = await repo.getCurrentWorkflow(jobId);
    const gens = await repo.listGenerations(jobId);
    for (const st of wf?.steps.filter((x) => x.status === "done") ?? []) {
      const takes = gens.filter((g) => g.stepId === st.id && !g.revisionId && g.status === "completed");
      if (takes.length && !takes.some((g) => g.reviewStatus === "approved")) {
        await repo.updateGeneration((takes.find((g) => g.selected) ?? takes[0]).id, { reviewStatus: "approved", selected: true });
      }
    }
    await tick(jobId);
  }
}

/** The demo operator confirms any open rights flags (e.g. exact logos) before approving a plan. */
async function clearOpenRights(jobId: string) {
  for (const a of (await getRepo().listApprovals(jobId)).filter((x) => x.kind === "rights_clearance" && x.status === "pending")) {
    await clearRights(jobId, a.id, "Brand assets confirmed with the client.");
  }
}

/**
 * After the Rain: Glass Monument — the full supervised client relationship on the
 * Launch Video template: one missing-input question, asset requests, a proposal,
 * a concept presentation, a real-milestone update, an auto self-repair of the
 * continuity/reflection failure, the "warmer & more hopeful" revision, and a
 * delivery package held for human approval.
 */
async function superviseGlass(jobId: string) {
  const repo = getRepo();
  // 1. Intake — the single material missing question, then specific asset requests + a proposal.
  await agency.askClientQuestion(jobId, "Before we lock the look: should the monument read as cast (frosted) glass or clear float glass? It changes the reflections and the after-storm highlight.");
  await agency.runIntakeConversation(jobId);
  await agency.sendProposal(jobId);
  // 2. Present concepts for the client's call.
  await agency.presentConcept(jobId, { changed: "locked the storm → clear arc on approved keyframes and kept the monument consistent across shots", decisionNeeded: "pick the hero keyframe for the final reveal" });
  // 3. A real-milestone progress update.
  await agency.sendProgressUpdate(jobId, "keyframes_approved");
  // 4. Supervised self-repair on the QA pass — auto-fix within the spend limits.
  await agency.applySelfRepairs(jobId);
  await fastForward(jobId, (s) => s === "qa");
  await agency.sendProgressUpdate(jobId, "qa_passed");
  // 5. Client revision — warmer, more hopeful reveal → interpreted as an included finishing edit.
  const note = "Make the final reveal warmer and more hopeful.";
  await agency.replyToRevision(jobId, note, 2, "D1");
  const revId = await addRevision(jobId, note, "D1");
  const rev = await repo.getRevision(revId);
  if (rev && rev.approvalStatus === "approved" && rev.modelId) {
    await runRevision(jobId, revId);
    await fastForward(jobId, (s) => s === "qa");
  }
  await agency.sendProgressUpdate(jobId, "revision_complete");
  // Select the finished masters so a delivery package exists.
  for (const g of (await repo.listGenerations(jobId)).filter((x) => x.status === "completed")) {
    const step = (await repo.getCurrentWorkflow(jobId))?.steps.find((s) => s.id === g.stepId);
    if (step && (step.category === "finishing" || step.category === "video") && !(await repo.listGenerations(jobId)).some((x) => x.stepId === g.stepId && x.selected)) {
      await repo.updateGeneration(g.id, { selected: true });
    }
  }
  // 6. Delivery package drafted — held for your approval (final delivery always needs you).
  await agency.draftDelivery(jobId);
  await agency.evaluatePauses(jobId);
}

/**
 * Night Orchard: Slow Orbit — a shorter, bespoke route focused on atmosphere,
 * low-light detail and smooth camera motion, with a recorded route comparison and
 * a spend-limit escalation that shows the agent cannot pick the premium route on its own.
 */
async function superviseOrchard(jobId: string) {
  const repo = getRepo();
  await audit({
    jobId,
    kind: "decision",
    summary: "Route comparison for the orbit: Kling O3 image-reference vs Cinema Studio.",
    detail: "Chose Kling O3 image-reference — it holds spatial continuity and low-light detail through a slow orbit at roughly half the per-shot cost. Cinema Studio is reserved for cinematic lensing this piece does not need.",
  });
  await agency.escalate(
    jobId,
    "spend_limit",
    "Premium motion route needs your approval",
    "The Cinema Studio route for the orbit would exceed the per-job automatic-spend limit.",
    "Keep the Kling O3 image-reference route (recommended) or approve a higher cap for Cinema Studio.",
  );
  await agency.sendProgressUpdate(jobId, "qa_passed");
  await agency.applySelfRepairs(jobId);
  await fastForward(jobId, (s) => s === "qa");
  for (const g of (await repo.listGenerations(jobId)).filter((x) => x.status === "completed")) {
    const step = (await repo.getCurrentWorkflow(jobId))?.steps.find((s) => s.id === g.stepId);
    if (step && (step.category === "finishing" || step.category === "video") && !(await repo.listGenerations(jobId)).some((x) => x.stepId === g.stepId && x.selected)) {
      await repo.updateGeneration(g.id, { selected: true });
    }
  }
  await agency.draftDelivery(jobId);
}

export async function seedDemo() {
  const repo = getRepo();

  // 1. Cinematic concept film — fully produced, in QA with revision notes.
  const aurora = await createJob({
    title: "Northlight — “Aurora” concept film",
    source: "upwork",
    clientName: "Northlight Outdoor AS",
    rawBrief: SEED_BRIEFS.aurora,
    budget: 4800,
    deadline: day(12),
    clientNotes: "Repeat client potential — they run a winter campaign every year. Hiring manager: Ingrid.",
    referenceAssets: ["northlight-polar-lookbook.pdf", "https://example.com/northlight/moodboard"],
  });
  await clearOpenRights(aurora);
  await approveInitialWorkflow(aurora, (await repo.getCurrentWorkflow(aurora))!.maxBudget);
  await startProduction(aurora);
  await fastForward(aurora, (s) => s === "qa");
  const r1 = await addRevision(aurora, "The end card logo feels too small — make the wordmark larger and check the tagline spelling.", "D1");
  await runRevision(aurora, r1);
  await fastForward(aurora, (s) => s === "qa");
  await addRevision(aurora, "Can the aurora shot at 0:22 be warmer? Push the grade toward amber a little.", "D1");
  await addRevision(aurora, "We'd also need a 6s bumper version for YouTube pre-roll.", null);

  // 2. Short contrasting brief — needs review for rights.
  await createJob({
    title: "Brightloaf — 15s sourdough loop",
    source: "fiverr",
    clientName: "Brightloaf Bakery",
    rawBrief: SEED_BRIEFS.bakery,
    budget: 450,
    deadline: day(4),
    clientNotes: null,
    referenceAssets: [],
  });

  // 3. Approved, ready to start — lets the operator watch generation live.
  const coffee = await createJob({
    title: "Fjord Coffee — cold brew stills",
    source: "email",
    clientName: "Fjord Coffee Co.",
    rawBrief: SEED_BRIEFS.coffee,
    budget: 900,
    deadline: day(7),
    clientNotes: "Came in via the contact form. Wants invoice in NOK.",
    referenceAssets: ["fjord-coffee-ss25-shoot.zip"],
  });
  await clearOpenRights(coffee);
  await approveInitialWorkflow(coffee, (await repo.getCurrentWorkflow(coffee))!.maxBudget);

  // 4. Hard stop — rejected automatically.
  await createJob({
    title: "Token hype video",
    source: "fiverr",
    clientName: null,
    rawBrief: SEED_BRIEFS.crypto,
    budget: 120,
    deadline: day(1),
    clientNotes: null,
    referenceAssets: [],
  });

  // 5. Delivered.
  const podcast = await createJob({
    title: "Signal & Noise — S3 launch kit",
    source: "contra",
    clientName: "Signal & Noise Media",
    rawBrief: SEED_BRIEFS.podcast,
    budget: 650,
    deadline: day(3),
    clientNotes: null,
    referenceAssets: ["https://example.com/signal-noise/s3"],
  });
  const pRights = (await repo.listApprovals(podcast)).find((a) => a.kind === "rights_clearance" && a.status === "pending");
  if (pRights) await clearRights(podcast, pRights.id, "Reviewed");
  await approveInitialWorkflow(podcast, (await repo.getCurrentWorkflow(podcast))!.maxBudget);
  await startProduction(podcast);
  await fastForward(podcast, (s) => s === "qa");
  await approveFinalDelivery(podcast, "Delivered manually on Contra.");

  // --- Demo 1: After the Rain: Glass Monument (the main showcase) ---
  const glass = await createJob({
    title: "After the Rain: Glass Monument",
    source: "upwork",
    clientName: "Glasverk Studio",
    rawBrief: SEED_BRIEFS.glassMonument,
    budget: 3800,
    deadline: day(3),
    clientNotes: "Fixed package price. Client supplies the monument reference and licensed music.",
    referenceAssets: [
      "monument-silhouette-approved.png",
      "glass-material-refs.zip",
      "site-direction.pdf",
      "weather-arc-notes.md",
      "likes-and-dislikes.pdf",
    ],
    templateId: "launch-video",
  });
  await clearOpenRights(glass);
  await approveInitialWorkflow(glass, (await repo.getCurrentWorkflow(glass))!.maxBudget);
  await startProduction(glass);
  await fastForward(glass, (s) => s === "qa");

  // --- Demo 2: Night Orchard: Slow Orbit (different creative problem → different route) ---
  const orchard = await createJob({
    title: "Night Orchard: Slow Orbit",
    source: "direct",
    clientName: "Lumen Films",
    rawBrief: SEED_BRIEFS.nightOrchard,
    budget: 1200,
    deadline: day(5),
    clientNotes: "Atmospheric spec piece. Client supplies the approved orchard keyframe.",
    referenceAssets: ["orchard-world-keyframe.png", "low-light-palette.png", "orbit-camera-direction.pdf", "pacing-reference.mp4"],
  });
  await clearOpenRights(orchard);
  await approveInitialWorkflow(orchard, (await repo.getCurrentWorkflow(orchard))!.maxBudget);
  await startProduction(orchard);
  await fastForward(orchard, (s) => s === "qa");

  // --- Supervised autonomy: settings, client memory, and the two demo runs ---
  await agency.getAutonomy(); // ensure the single account-level settings row exists
  await agency.upsertClientMemory({
    displayName: "Glasverk Studio",
    colors: ["#0b1f2a", "#9fd8e6"],
    fonts: ["Söhne", "GT Sectra"],
    logos: ["glasverk-wordmark.svg"],
    tone: "quiet, architectural, premium",
    productDetails: ["Translucent glass monument on an open plaza", "Architecture, material, scale and site stay consistent across shots"],
    winningAssets: ["after-rain reflection keyframe"],
    rejectedStyles: ["neon", "fast cuts", "heavy lens flares"],
    deliveryPreferences: "4K masters, both 9:16 and 16:9",
    communicationPreferences: "Email · concise updates at real milestones",
  });
  await agency.upsertClientMemory({
    displayName: "Lumen Films",
    colors: ["#0a0d12", "#1b2a3a"],
    tone: "atmospheric, low-light, unhurried",
    productDetails: ["Night-orchard world", "Preserve depth and spatial continuity through a slow orbit"],
    rejectedStyles: ["high-key lighting", "text on screen"],
    deliveryPreferences: "1080p, 16:9",
    communicationPreferences: "Direct email",
  });

  await superviseGlass(glass);
  await superviseOrchard(orchard);

  // 6. Fresh lead, not yet analysed.
  const libraryId = `job_seedlibrary${Date.now().toString(36).slice(-4)}`;
  const t = new Date().toISOString();
  await repo.insertJob({
    id: libraryId,
    title: "Vestland library — times of day",
    source: "direct",
    clientName: "Bergen architecture firm",
    rawBrief: SEED_BRIEFS.library,
    budget: 2500,
    deadline: day(21),
    status: "new",
    clientNotes: "Referral. Ask for renders, competition rules and deadline.",
    referenceAssets: [],
    sourceFeePct: 0,
    contingencyPct: 0.2,
    rightsCleared: false,
    templateId: null,
    deliveredAt: null,
    createdAt: t,
    updatedAt: t,
  });
  await repo.insertActivity({ id: `ev_seed${Date.now()}`, jobId: libraryId, actor: "operator", message: "Lead pasted from direct email. Not analysed yet.", createdAt: t });
}

const g = globalThis as unknown as { __studioSeed?: Promise<void> };

export async function ensureSeeded() {
  await loadRuntimeConfig();
  if (!g.__studioSeed) {
    g.__studioSeed = (async () => {
      try {
        if (await getRepo().countJobs() === 0) await seedDemo();
      } catch (err) {
        // Seeding is best-effort demo data — never let a partial seed take down
        // the whole app (e.g. when a provider cannot complete generations).
        console.error("Demo seeding did not finish:", (err as Error).message);
      }
    })();
  }
  return g.__studioSeed;
}

export async function resetDemo() {
  await getRepo().wipe();
  g.__studioSeed = seedDemo();
  await g.__studioSeed;
}
