import "server-only";
import { getRepo } from "@/lib/repo";
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
    const job = repo.getJob(jobId)!;
    if (until(job.status)) return;
    // Back-date just past the mock render window so the mock completes this tick,
    // but not so far that the application-level polling timeout would trip.
    for (const gen of repo.listGenerations(jobId).filter((x) => x.status === "queued" || x.status === "in_progress")) {
      repo.updateGeneration(gen.id, { startedAt: new Date(Date.now() - 10_000).toISOString() });
    }
    await tick(jobId);
  }
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
  approveInitialWorkflow(aurora, repo.getCurrentWorkflow(aurora)!.maxBudget);
  await startProduction(aurora);
  await fastForward(aurora, (s) => s === "qa");
  const r1 = addRevision(aurora, "The end card logo feels too small — make the wordmark larger and check the tagline spelling.", "D1");
  await runRevision(aurora, r1);
  await fastForward(aurora, (s) => s === "qa");
  addRevision(aurora, "Can the aurora shot at 0:22 be warmer? Push the grade toward amber a little.", "D1");
  addRevision(aurora, "We'd also need a 6s bumper version for YouTube pre-roll.", null);

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
  approveInitialWorkflow(coffee, repo.getCurrentWorkflow(coffee)!.maxBudget);

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
  const pRights = repo.listApprovals(podcast).find((a) => a.kind === "rights_clearance" && a.status === "pending");
  if (pRights) clearRights(podcast, pRights.id, "Reviewed");
  approveInitialWorkflow(podcast, repo.getCurrentWorkflow(podcast)!.maxBudget);
  await startProduction(podcast);
  await fastForward(podcast, (s) => s === "qa");
  approveFinalDelivery(podcast, "Delivered manually on Contra.");

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
  });
  approveInitialWorkflow(glass, repo.getCurrentWorkflow(glass)!.maxBudget);
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
  approveInitialWorkflow(orchard, repo.getCurrentWorkflow(orchard)!.maxBudget);
  await startProduction(orchard);
  await fastForward(orchard, (s) => s === "qa");

  // 6. Fresh lead, not yet analysed.
  const libraryId = `job_seedlibrary${Date.now().toString(36).slice(-4)}`;
  const t = new Date().toISOString();
  repo.insertJob({
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
    deliveredAt: null,
    createdAt: t,
    updatedAt: t,
  });
  repo.insertActivity({ id: `ev_seed${Date.now()}`, jobId: libraryId, actor: "operator", message: "Lead pasted from direct email. Not analysed yet.", createdAt: t });
}

const g = globalThis as unknown as { __studioSeed?: Promise<void> };

export function ensureSeeded() {
  if (!g.__studioSeed) {
    g.__studioSeed = (async () => {
      try {
        if (getRepo().countJobs() === 0) await seedDemo();
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
  getRepo().wipe();
  g.__studioSeed = seedDemo();
  await g.__studioSeed;
}
