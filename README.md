# Studio Operator

Internal operating system for a one-person AI creative studio. Paste a client brief, get structured requirements, an accept / review / reject decision, a costed production plan on Higgsfield models, and a human-gated production loop with outputs, QA and revisions.

## Run it

```bash
npm install
cp .env.example .env.local   # optional — mock mode is the default
npm run dev                  # http://localhost:3000
```

The first request seeds eight demo jobs (one per pipeline column, plus the two fully-produced showcase briefs used by the recording view). **Reset demo** in the header wipes and reseeds.

For a presenter-friendly walkthrough open **`/present`** (see *Recording mode* below).

## Deploy to Vercel

The app runs on Vercel with no configuration — import the GitHub repo and deploy.
Mock mode is the default, so the live demo needs no API keys.

- The SQLite file is written to `/tmp/studio.db` on Vercel automatically (the rest of the
  filesystem is read-only). `/tmp` is ephemeral and per-instance, so the demo data reseeds
  on a cold start — fine for a demo. For durable data, implement the `StudioRepository`
  interface against Postgres (see **Architecture**) and point `DATABASE_PATH` at a mounted disk
  on a host that provides one (Render, Railway, Fly.io).
- To go live instead of mock, set `STUDIO_MOCK_MODE=false` plus the Astra and Higgsfield keys
  from `.env.example` in the Vercel project's Environment Variables, and read **Before going live**.

## Persisting jobs in production

On Vercel the SQLite file lives in `/tmp`, which is wiped on cold starts and not shared between
serverless instances — so jobs, saved keys, the profile and the Live/mock choice do not survive.
Point the app at a real database instead. The backend is picked automatically, in this order:

1. **Postgres** — set `DATABASE_URL` (or `POSTGRES_URL`). Recommended.
2. **Turso / libSQL** — set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
3. A local **SQLite** file (`DATABASE_PATH`, default `./data/studio.db`) — right for local use or a host with a disk.

All three run the same repository code and the same portable schema; tables are created on first start.

**Postgres with Supabase (about two minutes):** create a project at supabase.com in a region near your
Vercel functions, open **Connect** and copy the **Transaction pooler** string (port 6543; use the Session pooler on
a long-running server). Set it as `DATABASE_URL` in `.env.local` and in the Vercel project's Environment Variables:

```
DATABASE_URL=postgres://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=no-verify
```

`sslmode=no-verify` avoids *"self-signed certificate in certificate chain"* from `pg` (the connection is still
encrypted). URL-encode special characters in the password (`@`, `:`, `/`, `#`). Redeploy, and Settings →
Connections should read *Database · Postgres*. The app only uses Supabase as plain Postgres, so no Supabase client,
auth or RLS setup is needed. Any other Postgres (Neon, RDS, a local server) works the same way: paste its
connection string into `DATABASE_URL`.

**Seed the demo data once (recommended for a remote database):** the first page view of an empty database seeds
the demo jobs, which takes minutes over a remote connection, longer than a serverless function may run. Do it once
from your own machine instead; the app then finds data and skips seeding:

```bash
# .env.local with DATABASE_URL pointing at the new database, then:
npm run db:seed              # asks before it wipes the database
```

If several serverless instances start on an empty database at once, only one seeds it (`seed:claim` in
`app_settings`). The script is also the way to repair a half-seeded database.

**Moving data from another Postgres:**

```bash
pg_dump --no-owner --no-privileges "$OLD_DATABASE_URL" > studio-backup.sql
psql "$NEW_DATABASE_URL" < studio-backup.sql
```

Use the Supabase **direct** or **Session pooler** string (port 5432) for the restore, not the Transaction pooler.

**Turso:**

```bash
turso db create studio-operator
turso db show studio-operator --url          # -> TURSO_DATABASE_URL
turso db tokens create studio-operator       # -> TURSO_AUTH_TOKEN
```

The repository interface is async (`src/lib/repo/repository.ts`), the SQL lives in
`src/lib/repo/sql-repository.ts`, and each database has a small driver in `src/lib/repo/drivers/`. Adding another
database means writing one more `SqlDriver`.

## Client link

Each job can have one unguessable client page at `/c/<token>` (job → **Client** tab → *Create client link*). It needs no
account and is the only route the sign-in does not cover. The client sees:

- the brief as understood, with *This is right* / *Something's off*
- the open intake questions, answerable in place
- **only the takes you approved** on the output review board, each with *Approve* / *Request a change*
- a free note field, and their own messages echoed back

Costs, margins, prompts, models, QA notes and rights notes are never sent: the page is built from an allow-list
(`src/lib/agency/portal.ts`), not filtered. A change request while the job is in QA becomes a normal revision, so the
scope and budget guardrails apply unchanged. Everything the client writes lands in the Client tab and the activity log.
*Revoke link* cuts access immediately; creating a link again mints a new token. For Upwork / Fiverr / Contra jobs the
link is never auto-sent — paste it into the platform chat yourself.

## Sign-in, profile and mock mode

**Sign-in.** Set `ADMIN_PASSCODE` (12+ characters) and every page, API route and server action requires a
signed-in session. Sign in at `/login`; the session is a signed, httpOnly cookie that lasts seven days
(`src/lib/auth/`). `src/proxy.ts` is the first gate, and every server action re-checks the session itself.
Eight wrong passcodes from one address pause sign-in for fifteen minutes. Changing the passcode signs
everyone out. With no `ADMIN_PASSCODE` there is nothing to sign in with, so the app stays open and shows a
warning bar rather than locking you out.

**Profile** (`/profile`). Your name (recorded on approvals, rights clearances and the audit log), the studio
name shown in the sidebar, an optional contact email, and your session with a sign-out button.

**Mock mode** (`/settings`). Switch between mock, live, or "follow `STUDIO_MOCK_MODE`" without redeploying.
Going live asks for the admin passcode again. Live generation additionally needs the Higgsfield keys and
`HIGGSFIELD_WIRE_ENABLED=true`. Profile and mode are stored in the database, so use Turso on Vercel for them to persist.

## API keys on the Settings page

`/settings` has an **API keys** card for the OpenAI key and the Higgsfield key ID / secret, so you
can fill in or swap keys without redeploying. It is off until the server has an `ADMIN_PASSCODE`
(12+ characters). Every change must include that passcode, keys are stored AES-256-GCM encrypted
in the database (key derived from the passcode), and values are write-only: the page only shows
where a key comes from and its last four characters. A key saved here overrides the environment
variable; ticking *Remove* falls back to it. Use Turso for persistence on Vercel, otherwise saved
keys live in temporary storage. Mock mode (`STUDIO_MOCK_MODE`) and `HIGGSFIELD_WIRE_ENABLED` are
still environment settings: keys alone do not switch generation to live.

## Brief analysis (GPT-6 Astra)

Pasting a brief runs a structured intake analysis. With `OPENAI_API_KEY` set it calls the
real model (`gpt-6-astra`) through the **OpenAI Responses API** with **Structured Outputs**,
so the JSON is validated against the schema (`src/lib/analysis/schema.ts`) before anything is
written to the database. Without a key — or if the call or validation fails — a deterministic
offline analyzer produces the same schema, so the flow always works. The API key is read only
on the server (`src/lib/config.ts`).

The model never prices anything: it proposes each step by the **capability** it needs and an
attempt estimate. The application resolves each capability to a catalogued model and computes
cost deterministically (`src/lib/analysis/cost.ts`), then makes the final **accept /
human_review / reject** call (`src/lib/analysis/decision.ts`) from catalog prices, source/channel
fees, contingency, the approved attempt limits and the configured production budget. If a step
has no catalogue price, the job is routed to human review rather than guessing.

That one analysis is the single source of truth for a brief. The production plan is built
directly from the priced cost plan (`src/lib/analysis/plan.ts`) — the same steps, catalogued models
and attempts the decision was made on — and the flatter shape the screens, QA and revision
planning read (numbered deliverables, merged dimensions / text / rights) is derived on read
(`src/lib/analysis/view.ts`), never stored.

Open **Review analysis** on a job to edit any extracted field and approve or reject it. Saving an
edit re-runs the deterministic decision and rebuilds the plan from the edited analysis (until a
workflow is approved; after that, scope only changes through a revision). Both the original
analysis and the human-edited version are stored for comparison. Tests for the schema, malformed
responses, missing fields, the deterministic decision rules, the derived view and the plan live
beside the code (`src/lib/analysis/*.test.ts`); run them with `npm test`.

## Model router (transparent)

The **Model router** screen proposes a staged route for a brief and explains it — it is not a black box.
Models are grouped by production role in a configurable capability catalog (`src/lib/router/catalog.ts`):

- **SEARCH** — cheap/fast lanes for many hooks, compositions and rough concepts.
- **CONTROL** — preserve a product, face, character, motion, layout, logo, label or exact text.
- **SHIP** — premium models for the final client-facing asset.
- **FINISH** — upscale, denoise, lip sync, voice, captions, localization and export.

For the brief's signals (deliverable, reference/identity, exact text/packaging, resolution, duration,
deadline, attempts, price, target margin) the router proposes a route like *generate 8 concepts → choose 2 →
controlled keyframes → final motion → repair a continuity failure if needed → upscale → QA*. Every stage shows
the selected model, why it fits, its known failure mode, an alternative, estimated attempts, cost per attempt
and the maximum authorized spend. A manual model override recalculates the economics instantly
(`src/lib/router/route.ts`). Nothing runs until the human approves the initial paid workflow and a maximum
spend; after approval the agent operates only inside those limits.

> The catalog's model families, capabilities and costs are **seeded from routing principles and not yet verified
> against the live Higgsfield catalog** (the docs host is unreachable from the build environment). Entries marked
> "confirm" in the UI are pending verification; prices drive the economics, so confirm them before any paid run.

## Workflow

1. **Intake** — New Job: paste the brief, client price, deadline, source, channel fee, reference assets.
2. **Analysis** — GPT-6 Astra (or the offline analyzer in mock mode) extracts deliverables, dimensions, durations, references, verbatim text, brand constraints, rights concerns and missing information.
3. **Decision** — the model's suggestion is combined with deterministic rules: margin floor/target, deadline feasibility, rights, confidence, and hard stops (e.g. deceptive real-person content).
4. **Plan & cost** — the priced steps from the analysis, on image, video, voice, editing and finishing models, with attempts × unit cost, a proposed cap (estimate + contingency) and expected gross margin.
5. **Human approval** — rights clearance (if flagged) and the workflow + maximum generation budget.
6. **Production** — the agent runs steps in order only while committed spend + next estimate fits under the cap; otherwise it pauses and requests a budget increase.
7. **QA & revisions** — select takes, log client notes. Notes that fit the remaining cap are auto-approved; scope changes and overruns wait for you. Final delivery always needs approval.

## Automated QA & self-repair

Each completed output is scored against the approved brief (`src/lib/qa/qa.ts`, pure and unit-tested) into a structured checklist:

- **Structural (real):** deliverable type, aspect ratio, resolution, duration — compared against the planned deliverable and the step's own output modality (a look-development step is graded as an *image*, not against the final video).
- **Perceptual (heuristic in mock):** product/brand consistency, verbatim text/label/spelling, required scenes, prohibited elements, and — only when the brief actually involves people — faces, hands, motion, continuity, audio and lip-sync. An explicit *"no people"* brief suppresses the face/hand checks. With no vision model in mock mode these are deterministic simulations seeded by the generation id and clearly labelled *(heuristic)*.

Each output gets a verdict: **acceptable as a concept / needs a controlled edit / needs regeneration / ready for human delivery review**.

When the verdict calls for a fix, `src/lib/qa/repair.ts` proposes a **targeted repair** and shows its economics up front — reason, selected model, expected incremental cost, new total, updated margin. A repair runs automatically **only** within the pre-approved limits (per-repair, per-job, and max auto-repairs — `QA_PER_REPAIR_MAX_USD`, `QA_PER_JOB_REPAIR_MAX_USD`, `QA_MAX_AUTO_REPAIRS`, `QA_REPAIR_ATTEMPTS`, all in `src/lib/config.ts`). Anything over a limit is recommended but requires human approval; the blocking limit is named.

## Supervised autonomy (the Client Agent)

Studio Operator runs as a **supervised autonomous creative agency**: the agent runs the routine client relationship from intake through revisions, while the human stays responsible for the promises that matter — accepting contracts, approving payments or spend above a threshold, resolving rights/identity, and approving final delivery.

- **Client Agent** (`src/lib/agency/client-agent.ts`, pure + tested) turns a vague request into a structured intake conversation, asks only the questions that materially affect quality/cost/rights/deadline, requests specific assets (product image, logo, brand guide, exact copy, pronunciation, voice/likeness consent, likes and dislikes), summarizes scope, drafts a proposal, sends real-milestone progress updates, presents concepts with what changed + the decision needed, interprets revision feedback (which asset/step, included vs scope change), drafts a change order when scope is exceeded, prepares the delivery package + usage notes, and drafts a post-delivery feedback/testimonial/recurring-package ask.
- **Marketplace-safe messaging** (`src/lib/services/agency.ts`): a message is auto-sent only on an allowed channel (direct email / approved first-party portal) and only for a type enabled in Autonomy Settings. **Third-party marketplaces are never auto-sent** — no scraping, auto-apply, proposal send, or contract accept — until the app receives an approved integration for that exact action.
- **Autonomy Settings** (`/autonomy`): max automatic spend per job and per repair, max attempts per step, allowed model families, which messages may be sent automatically vs drafted, whether concepts auto-share, whether final delivery always needs approval, and the conditions that **always pause** (likeness/voice, unclear ownership, factual claims, packaging/regulated copy, negative margin, deadline risk, client dispute).
- **Client memory** (account level): approved logos, colours, fonts, tone, product details, winning assets, rejected styles, delivery and communication preferences — never treated as consent for a new person's likeness, voice, or a materially different use.
- **Productized service templates** (`src/lib/agency/templates.ts`): **Launch Video**, **UGC Ad Pack**, **Localization Pack**. Each fixes required inputs, accepted file types, model recipe, quality checklist, included revisions, delivery package, target gross margin, maximum production spend and escalation conditions — that fixity is what makes autonomy possible.
- **Supervised self-repair** (`src/lib/agency/self-repair.ts`): compares each output with the approved brief, finds the smallest failed component, chooses the smallest fix (targeted edit / regenerate one shot / change model / ask the client), estimates incremental cost against the remaining budget, and continues automatically **only** inside the pre-approved spend limit and with no new rights/factual/identity concern. Everything else escalates with a recommended action.
- **Autonomy audit log**: every model decision, message draft/send, approval, generation, repair, cost change and escalation is recorded, so the demo makes clear the agent runs the job while the human supervises.

## Recording mode (`/present`)

A single-screen walkthrough built for screen-recording the whole flow (`src/app/present/page.tsx` + `presenter.tsx`):

- **Large status labels** and a **step-through control** (Brief → Analysis → Approval → Generation → QA → Delivery) so you can pause before each stage.
- **One-click reset** to the seeded briefs.
- A **cost ledger** (every generation attempt: model, take, status, estimate, recorded spend + total) and a **side-by-side profit strip** (client price · channel fee · API cost · contingency · expected gross profit).
- The **QA checklist** per output with its verdict and the transparent repair decision.
- A supervised-autonomy strip, the **Client Agent** message thread (drafted vs auto-sent, with channel), client memory + template, the **supervised self-repair** decisions, **escalations to you**, the **final-delivery approval gate**, and the **autonomy audit log**.
- A **final-deliverables grid** with download links and a **client-ready delivery note drafted by Astra**.

Two showcase briefs demonstrate different routes:

- **After the Rain: Glass Monument** — runs the **full supervised workflow** on the Launch Video template: one missing-input question, asset requests, a proposal and concept presentation, a real-milestone update, an auto self-repair of the continuity/reflection failure within limits (the rest escalated once budget ran low), a *"warmer and more hopeful"* revision interpreted as an included finishing edit, and a delivery package **held for your approval**.
- **Night Orchard: Slow Orbit** — a shorter, bespoke route focused on atmosphere, low-light detail and smooth camera motion, with a recorded route comparison (Kling O3 image-reference vs Cinema Studio) and a **spend-limit escalation** showing the agent cannot pick the premium route on its own.

Mock mode is enforced for the demo — the header shows a **"no external calls, no secrets"** badge and the browser never receives API keys or private client data (`publicConfig()` strips them).

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
- **Persistence**: an async `StudioRepository` interface (`src/lib/repo/repository.ts`) implemented once in SQL (`sql-repository.ts`) over a small `SqlDriver` per database — Postgres (`pg`), Turso/libSQL, or a local SQLite file (`better-sqlite3`). `schema.sql` is portable and is applied once per schema version.
- **Secrets**: read only in `src/lib/config.ts` (`server-only`). The browser receives a `publicConfig()` without keys.
- **Providers**:
  - `src/lib/analysis/astra.ts` — Astra via the OpenAI Responses API with Structured Outputs, validated with zod; falls back to the offline analyzer (`mock.ts`) and logs a warning if the call fails.
  - `src/lib/higgsfield/provider.ts` — live adapter following docs.higgsfield.ai (`POST /{model endpoint}`, `Authorization: Key id:secret`, `Idempotency-Key`, poll `status_url`; statuses `queued | in_progress | completed | failed | nsfw | canceled`) and a deterministic mock provider.
- **Production loop**: `tick()` polls in-flight requests, settles steps, submits the next step within the cap, and moves the job to QA. In the demo the open tab drives it every 2s; in deployment, call `tickAllGenerating()` from a worker or a Higgsfield webhook.

## Before going live

- `src/lib/higgsfield/catalog.ts`: only the Kling O3 image-reference endpoint is verified against Higgsfield docs. Confirm the other endpoint paths in the API console, and replace the placeholder **unit costs** with your real credit pricing — margins are only as good as these numbers.
- Higgsfield's status payload doesn't report spend, so live "actual cost" stays empty until you reconcile; guardrails use the estimate meanwhile.
- `OPENAI_MODEL` / `OPENAI_BASE_URL` (or the `ASTRA_*` fallbacks) assume the OpenAI Responses API; adjust if Astra's API differs.
- Gross margin here is generation economics only (price − fee − spend − contingency). Your own time is not costed.
