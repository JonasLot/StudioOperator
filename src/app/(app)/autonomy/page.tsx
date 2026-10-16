import { Bot, Layers, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SERVICE_TEMPLATES } from "@/lib/agency/templates";
import { ensureSeeded } from "@/lib/seed";
import { getAutonomy, listClientMemory } from "@/lib/services/agency";
import { pct, usd } from "@/lib/utils";
import { AutonomyForm } from "./autonomy-form";

export const dynamic = "force-dynamic";

export default async function AutonomyPage() {
  await ensureSeeded();
  const settings = getAutonomy();
  const memory = listClientMemory();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Workspace / Autonomy"
        title="How far the agent may go."
        subtitle="The agent runs the routine client relationship from intake through revisions. You stay responsible for contracts, payments and spend above these limits, rights or identity, and final delivery."
      />

      <AutonomyForm settings={settings} />

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold"><Users className="size-4 text-muted-foreground" /> Client memory</h2>
        {memory.length === 0 ? (
          <p className="rounded-xl border bg-card px-5 py-6 text-[13.5px] text-muted-foreground">No client memory yet. Approved logos, colours, fonts, tone, winning assets and rejected styles are remembered per client — but never as consent for a new person’s likeness, voice, or a materially different use.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {memory.map((m) => (
              <div key={m.id} className="rounded-xl border bg-card p-5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[14.5px] font-semibold">{m.displayName}</h3>
                  {m.tone ? <span className="rounded bg-muted px-2 py-0.5 text-[11.5px] text-muted-foreground">{m.tone}</span> : null}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
                  {m.colors.length ? (<><dt className="text-muted-foreground">Colours</dt><dd className="flex items-center gap-1.5">{m.colors.map((c) => <span key={c} className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-sm border" style={{ background: c }} />{c}</span>)}</dd></>) : null}
                  {m.fonts.length ? (<><dt className="text-muted-foreground">Fonts</dt><dd>{m.fonts.join(", ")}</dd></>) : null}
                  {m.logos.length ? (<><dt className="text-muted-foreground">Logos</dt><dd>{m.logos.join(", ")}</dd></>) : null}
                  {m.productDetails.length ? (<><dt className="text-muted-foreground">Product</dt><dd>{m.productDetails.join("; ")}</dd></>) : null}
                  {m.winningAssets.length ? (<><dt className="text-muted-foreground">Winning</dt><dd>{m.winningAssets.join("; ")}</dd></>) : null}
                  {m.rejectedStyles.length ? (<><dt className="text-muted-foreground">Avoid</dt><dd>{m.rejectedStyles.join("; ")}</dd></>) : null}
                  {m.deliveryPreferences ? (<><dt className="text-muted-foreground">Delivery</dt><dd>{m.deliveryPreferences}</dd></>) : null}
                  {m.communicationPreferences ? (<><dt className="text-muted-foreground">Comms</dt><dd>{m.communicationPreferences}</dd></>) : null}
                </dl>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold"><Layers className="size-4 text-muted-foreground" /> Productized service templates</h2>
        <p className="mb-3 text-[13px] text-muted-foreground">Templates are what make autonomy possible: fixed inputs, model recipe, quality bar, included revisions, delivery package, target margin, maximum spend and the conditions that always pause.</p>
        <div className="grid gap-4 lg:grid-cols-3">
          {SERVICE_TEMPLATES.map((t) => (
            <div key={t.id} className="flex flex-col rounded-xl border bg-card p-5">
              <div className="flex items-center gap-2">
                <Bot className="size-4 text-brand" />
                <h3 className="text-[15px] font-semibold">{t.name}</h3>
              </div>
              <p className="mt-1.5 text-[13px] text-muted-foreground">{t.summary}</p>
              <p className="mt-2 rounded-md bg-muted px-2.5 py-1.5 text-[12.5px]">{t.deliverablesSummary}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
                <div><dt className="text-muted-foreground">Target margin</dt><dd className="tnum font-medium text-ok">{pct(t.targetGrossMarginPct)}</dd></div>
                <div><dt className="text-muted-foreground">Max prod. spend</dt><dd className="tnum font-medium">{usd(t.maxProductionSpendUsd)}</dd></div>
                <div><dt className="text-muted-foreground">Included revisions</dt><dd className="tnum font-medium">{t.includedRevisions}</dd></div>
                <div><dt className="text-muted-foreground">Turnaround</dt><dd className="tnum font-medium">{t.defaultTurnaroundHours}h</dd></div>
              </dl>
              <details className="mt-3 text-[12.5px]">
                <summary className="cursor-pointer text-muted-foreground">Inputs · recipe · checklist · escalations</summary>
                <div className="mt-2 flex flex-col gap-2">
                  <div><span className="font-medium">Required inputs:</span> {t.requiredInputs.filter((i) => i.required).map((i) => i.label).join(", ") || "—"}</div>
                  <div><span className="font-medium">Accepted files:</span> {t.acceptedFileTypes.join(", ")}</div>
                  <div><span className="font-medium">Recipe:</span> {t.modelRecipe.map((r) => `${r.label}`).join(" → ")}</div>
                  <div><span className="font-medium">Quality checklist:</span><ul className="ml-4 list-disc">{t.qualityChecklist.map((c) => <li key={c}>{c}</li>)}</ul></div>
                  <div><span className="font-medium">Delivery package:</span> {t.deliveryPackage.join(", ")}</div>
                  <div><span className="font-medium text-warn">Always pause:</span><ul className="ml-4 list-disc">{t.escalationConditions.map((c) => <li key={c}>{c}</li>)}</ul></div>
                </div>
              </details>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
