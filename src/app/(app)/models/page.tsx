import Link from "next/link";
import { BadgeCheck, CheckCircle2, ChevronRight, CircleDashed, CircleSlash, Cpu, MessageSquareText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { astraLive, config, draftLive } from "@/lib/config";
import { listEndpointModels } from "@/lib/creative/draft";
import { CATEGORY_LABEL, type ModelCategory } from "@/lib/domain/types";
import { MODEL_CATALOG } from "@/lib/higgsfield/catalog";
import { byRole, ROLE_META, ROUTER_ROLES } from "@/lib/router/catalog";
import { usd } from "@/lib/utils";
import { RouterStudio } from "./router-studio";
import { loadRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

const ROLE_ACCENT: Record<string, string> = {
  search: "text-info",
  control: "text-warn",
  ship: "text-brand",
  finish: "text-ok",
};

const CATEGORIES: ModelCategory[] = ["image", "video", "voice", "editing", "finishing"];

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] ${ok ? "bg-ok-soft text-ok" : "bg-muted text-muted-foreground"}`}>
      {ok ? <CheckCircle2 className="size-3" /> : <CircleSlash className="size-3" />}
      {children}
    </span>
  );
}

function SectionTitle({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
      <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">{children}</p>
    </div>
  );
}

export default async function ModelsPage() {
  await loadRuntimeConfig();

  // Is the first-phase model actually installed at its endpoint? (Only asked when one is configured.)
  const installed = draftLive() ? await listEndpointModels(config.draft.baseUrl, config.draft.apiKey).catch(() => null) : null;
  const draftModel = config.draft.model;
  const draftInstalled = installed ? installed.includes(draftModel) || installed.includes(`${draftModel}:latest`) : null;
  const draftDetail = !config.draft.baseUrl || !draftModel
    ? "Not set · the offline drafter is used"
    : !draftLive()
      ? "Set · switched off by mock mode"
      : installed === null
        ? `Endpoint not answering (${config.draft.baseUrl}) · falls back to the offline drafter`
        : draftInstalled
          ? `Live · ${config.draft.baseUrl}`
          : `Not installed at ${config.draft.baseUrl} · falls back to the offline drafter`;

  const textModels = [
    {
      role: "Brief analysis & sparring",
      uses: "Reads the client brief into requirements, and sharpens the creative brief with you.",
      model: config.openai.model,
      ok: astraLive(),
      detail: astraLive() ? "Live · OpenAI" : "No OpenAI key or mock mode · offline stand-in",
    },
    {
      role: "First-phase AI",
      uses: "Writes the first draft of the creative brief and suggests the prompt for each step.",
      model: draftModel || "not set",
      ok: Boolean(draftLive() && draftInstalled),
      detail: draftDetail,
    },
  ];

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        eyebrow="Workspace / Models"
        title="Which model does what."
        subtitle="The text models that write and sharpen briefs, the models a workflow step can actually run, and — further down — the route planner for pricing new work."
      />

      {/* 1. Text models */}
      <section className="flex flex-col gap-4">
        <SectionTitle title="Text models">
          They write words, never images. Change them under{" "}
          <Link href="/settings" className="underline underline-offset-2">Settings</Link>.
        </SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          {textModels.map((t) => (
            <div key={t.role} className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <MessageSquareText className="size-3.5" /> {t.role}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[14px] font-medium">{t.model}</span>
                <Status ok={t.ok}>{t.ok ? "live" : "offline"}</Status>
              </div>
              <p className="mt-1.5 text-[13px]">{t.uses}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{t.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Runnable models */}
      <section className="flex flex-col gap-4">
        <SectionTitle title="Models a step can run">
          These are the choices in each step&apos;s model dropdown on a job&apos;s Workflow tab. A step only offers models of its own kind (image, video …).
          Local models run on this Mac through ComfyUI ({config.comfy.url}) and cost nothing;{" "}
          <Link href="/settings/connection-test" className="underline underline-offset-2">test the connection</Link>.
        </SectionTitle>
        <div className="overflow-hidden rounded-xl border bg-card">
          {CATEGORIES.map((cat) => {
            const models = MODEL_CATALOG.filter((m) => m.category === cat);
            if (!models.length) return null;
            return (
              <div key={cat} className="border-b last:border-b-0">
                <div className="bg-muted/35 px-5 py-2 text-[12px] font-medium text-muted-foreground">{CATEGORY_LABEL[cat]}</div>
                <ul className="divide-y">
                  {models.map((m) => (
                    <li key={m.id} className="grid gap-1 px-5 py-3 md:grid-cols-[minmax(0,1fr)_170px] md:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                          {m.label}
                          {m.local ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-ok-soft px-1.5 py-0.5 text-[11px] text-ok"><Cpu className="size-3" /> local</span>
                          ) : m.verified ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-ok-soft px-1.5 py-0.5 text-[11px] text-ok"><BadgeCheck className="size-3" /> Higgsfield · verified</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"><CircleDashed className="size-3" /> Higgsfield · endpoint to confirm</span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[13px] text-muted-foreground">{m.strengths}</div>
                      </div>
                      <div className="tnum md:text-right">
                        {m.local ? <span className="text-[14px] font-semibold">Free</span> : <span className="text-[14px] font-semibold">{usd(m.unitCostUsd, { cents: true })}</span>}{" "}
                        <span className="text-[12px] text-muted-foreground">{m.unitLabel.replace(" (local)", "")}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="text-[12px] text-muted-foreground">Prices are planning estimates (Higgsfield bills in credits). Edit them in <code className="font-mono text-[11.5px]">src/lib/higgsfield/catalog.ts</code>.</p>
      </section>

      {/* 3. Route planner (planning only) */}
      <details className="group rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none items-start gap-2 px-5 py-4">
          <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Route planner <span className="ml-1 align-middle rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">planning only</span></h2>
            <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">
              A sandbox for pricing a new kind of job across Higgsfield&apos;s full model list. Choices here do not change any job. Most of these models cannot run yet; the ones that can are marked.
            </p>
          </div>
        </summary>
        <div className="flex flex-col gap-10 border-t px-5 py-6">
          <RouterStudio />
          <section className="flex flex-col gap-6">
            <div>
              <h3 className="text-[15px] font-semibold">Planning catalog</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Grouped by production role. Configurable in <code className="font-mono text-[12px]">src/lib/router/catalog.ts</code>.
              </p>
            </div>
            {ROUTER_ROLES.map((role) => (
              <div key={role}>
                <h4 className={`eyebrow mb-1 ${ROLE_ACCENT[role]}`}>{ROLE_META[role].label}</h4>
                <p className="mb-3 text-[12.5px] text-muted-foreground">{ROLE_META[role].blurb}</p>
                <div className="overflow-hidden rounded-xl border bg-card">
                  <ul className="divide-y">
                    {byRole(role).map((m) => (
                      <li key={m.id} className="grid gap-2 px-5 py-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_150px] md:items-start">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                            {m.label}
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">{m.family}</span>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">{m.medium.replace("_", " ")}</span>
                            {m.providerModelId ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-ok-soft px-1.5 py-0.5 text-[11px] text-ok"><BadgeCheck className="size-3" /> can run in workflows</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"><CircleDashed className="size-3" /> planning only</span>
                            )}
                          </div>
                          <div className="mt-1 text-[13px] text-muted-foreground">{m.strengths}</div>
                        </div>
                        <div className="text-[12.5px] text-muted-foreground"><span className="text-foreground/70">Fails by:</span> {m.failureMode}</div>
                        <div className="tnum md:text-right">
                          <div><span className="text-[15px] font-semibold">{usd(m.costPerAttemptUsd, { cents: true })}</span> <span className="text-[12px] text-muted-foreground">{m.unitLabel}</span></div>
                          <div className="mt-0.5 text-[11.5px] text-muted-foreground">{m.speed} · {m.typicalQueue}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </section>
        </div>
      </details>
    </div>
  );
}
