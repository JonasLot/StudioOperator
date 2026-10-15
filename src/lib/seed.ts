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
};

/** Drive the mock provider to completion instantly by back-dating in-flight work. */
async function fastForward(jobId: string, until: (status: string) => boolean, maxRounds = 40) {
  const repo = getRepo();
  for (let i = 0; i < maxRounds; i++) {
    const job = repo.getJob(jobId)!;
    if (until(job.status)) return;
    for (const gen of repo.listGenerations(jobId).filter((x) => x.status === "queued" || x.status === "in_progress")) {
      repo.updateGeneration(gen.id, { startedAt: new Date(Date.now() - 3_600_000).toISOString() });
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
      if (getRepo().countJobs() === 0) await seedDemo();
    })();
  }
  return g.__studioSeed;
}

export async function resetDemo() {
  getRepo().wipe();
  g.__studioSeed = seedDemo();
  await g.__studioSeed;
}
