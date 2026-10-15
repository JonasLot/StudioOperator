import { BadgeCheck, CircleDashed } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { CATEGORY_LABEL, type ModelCategory } from "@/lib/domain/types";
import { MODEL_CATALOG } from "@/lib/higgsfield/catalog";
import { usd } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ORDER: ModelCategory[] = ["image", "video", "voice", "editing", "finishing"];

export default function ModelsPage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Workspace / Model router"
        title="Which model does what."
        subtitle="The planner routes each production step to one of these Higgsfield models. Unit costs drive every estimate and margin, so keep them honest."
      />
      {ORDER.map((cat) => {
        const models = MODEL_CATALOG.filter((m) => m.category === cat);
        return (
          <section key={cat}>
            <h2 className="eyebrow mb-3">{CATEGORY_LABEL[cat]}</h2>
            <div className="overflow-hidden rounded-xl border bg-card">
              <ul className="divide-y">
                {models.map((m) => (
                  <li key={m.id} className="grid gap-2 px-6 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px] md:items-center">
                    <div>
                      <div className="flex items-center gap-2 text-[14.5px] font-medium">
                        {m.label}
                        {m.verified ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-ok-soft px-1.5 py-0.5 text-[11px] text-ok"><BadgeCheck className="size-3" /> Verified endpoint</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"><CircleDashed className="size-3" /> Confirm endpoint</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[13px] text-muted-foreground">{m.strengths}</div>
                    </div>
                    <code className="truncate font-mono text-[12px] text-muted-foreground">POST {m.endpoint}</code>
                    <div className="tnum md:text-right">
                      <span className="text-[15px] font-semibold">{usd(m.unitCostUsd, { cents: true })}</span>
                      <span className="ml-1 text-[12px] text-muted-foreground">{m.unitLabel}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}
      <p className="text-[12.5px] text-muted-foreground">Unit costs are planning placeholders until replaced with your Higgsfield credit pricing in <code className="font-mono">src/lib/higgsfield/catalog.ts</code>.</p>
    </div>
  );
}
