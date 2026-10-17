import { BadgeCheck, CircleDashed } from "lucide-react";
import { PageHeader } from "@/components/page-header";
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

export default async function ModelsPage() {
  await loadRuntimeConfig();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Workspace / Model router"
        title="A transparent route, not a black box."
        subtitle="The router proposes a staged route, explains why each model fits, shows alternatives and known failure modes, and prices it — but nothing runs until you approve the workflow and a maximum spend."
      />

      <RouterStudio />

      <section className="flex flex-col gap-6">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Capability catalog</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Grouped by production role. Configurable in <code className="font-mono text-[12px]">src/lib/router/catalog.ts</code>. Models marked <em>in catalog</em> are in Higgsfield&apos;s live model
            list. Prices are planning estimates by tier — Higgsfield bills in credits and its list has no prices — so replace them before relying on the margin.
          </p>
        </div>
        {ROUTER_ROLES.map((role) => (
          <div key={role}>
            <h3 className={`eyebrow mb-1 ${ROLE_ACCENT[role]}`}>{ROLE_META[role].label}</h3>
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
                        {m.listed ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-ok-soft px-1.5 py-0.5 text-[11px] text-ok"><BadgeCheck className="size-3" /> in catalog</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"><CircleDashed className="size-3" /> confirm</span>
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
  );
}
