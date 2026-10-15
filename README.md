# Studio Operator

Internal operating system for a one-person AI creative studio. Paste a client brief, get structured requirements, an accept / review / reject decision, a costed production plan on Higgsfield models, and a human-gated production loop with outputs, QA and revisions.

## Run it

```bash
npm install
cp .env.example .env.local   # optional — mock mode is the default
npm run dev                  # http://localhost:3000
```

The first request seeds six demo jobs (one per pipeline column, plus an empty Generating column you fill by starting production). **Reset demo** in the header wipes and reseeds.

## Workflow

1. **Intake** — New Job: paste the brief, client price, deadline, source, channel fee, reference assets.
2. **Analysis** — GPT-6 Astra (or the offline analyzer in mock mode) extracts deliverables, dimensions, durations, references, verbatim text, brand constraints, rights concerns and missing information.
3. **Decision** — the model's suggestion is combined with deterministic rules: margin floor/target, deadline feasibility, rights, confidence, and hard stops (e.g. deceptive real-person content).
4. **Plan & cost** — ordered steps on image, video, voice, editing and finishing models, with attempts × unit cost, a proposed cap (estimate + contingency) and expected gross margin.
5. **Human approval** — rights clearance (if flagged) and the workflow + maximum generation budget.
6. **Production** — the agent runs steps in order only while committed spend + next estimate fits under the cap; otherwise it pauses and requests a budget increase.
7. **QA & revisions** — select takes, log client notes. Notes that fit the remaining cap are auto-approved; scope changes and overruns wait for you. Final delivery always needs approval.

## Guardrails

| Rule | Where |
|---|---|
| No generation before workflow + cap approval | `src/lib/services/guardrails.ts`, `studio.ts` |
| Spend never exceeds the approved cap without a human | `fitsBudget` checks before every submit |
| Rights issues block approval until cleared | `assertRightsCleared` |
| Budget increase, scope change, final delivery → human | `ApprovalRequest` records + timeline |
| No marketplace automation (scrape, propose, accept, message, deliver) | `src/lib/services/marketplace-policy.ts` — allow-list is empty |

All checks run server-side; the UI only reflects them.

## Architecture

- **Next.js 16 (App Router) + TypeScript, Tailwind v4, shadcn/ui (vendored in `src/components/ui`), Lucide.**
- **Persistence**: `StudioRepository` interface (`src/lib/repo/repository.ts`) with a SQLite implementation (`better-sqlite3`). `schema.sql` is portable; implement the interface for Postgres and swap it in `src/lib/repo/index.ts`.
- **Secrets**: read only in `src/lib/config.ts` (`server-only`). The browser receives a `publicConfig()` without keys.
- **Providers**:
  - `src/lib/ai/brief-analyzer.ts` — Astra via OpenAI-compatible chat completions with JSON-schema output, validated with zod; falls back to the offline analyzer and logs a warning if the call fails.
  - `src/lib/higgsfield/provider.ts` — live adapter following docs.higgsfield.ai (`POST /{model endpoint}`, `Authorization: Key id:secret`, `Idempotency-Key`, poll `status_url`; statuses `queued | in_progress | completed | failed | nsfw | canceled`) and a deterministic mock provider.
- **Production loop**: `tick()` polls in-flight requests, settles steps, submits the next step within the cap, and moves the job to QA. In the demo the open tab drives it every 2s; in deployment, call `tickAllGenerating()` from a worker or a Higgsfield webhook.

## Before going live

- `src/lib/higgsfield/catalog.ts`: only the Kling O3 image-reference endpoint is verified against Higgsfield docs. Confirm the other endpoint paths in the API console, and replace the placeholder **unit costs** with your real credit pricing — margins are only as good as these numbers.
- Higgsfield's status payload doesn't report spend, so live "actual cost" stays empty until you reconcile; guardrails use the estimate meanwhile.
- `ASTRA_MODEL` / `ASTRA_BASE_URL` assume an OpenAI-compatible endpoint; adjust if Astra's API differs.
- Gross margin here is generation economics only (price − fee − spend − contingency). Your own time is not costed.
