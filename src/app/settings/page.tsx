import type { ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, CircleSlash, FlaskConical, PlugZap, RotateCcw, Store } from "lucide-react";
import { resetDemoAction } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { astraLive, config, higgsfieldLive } from "@/lib/config";
import { SOURCE_LABEL, type JobSource } from "@/lib/domain/types";
import { MANUAL_MARKETPLACE_STEPS } from "@/lib/services/marketplace-policy";
import { pct } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
      <h2 className="border-b px-6 py-4 text-[15px] font-semibold">{title}</h2>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

function Conn({ name, ok, detail }: { name: string; ok: boolean; detail: string }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 text-ok" /> : <CircleSlash className="mt-0.5 size-4 text-muted-foreground" />}
      <span>
        <span className="block text-[14px] font-medium">{name}</span>
        <span className="text-[12.5px] text-muted-foreground">{detail}</span>
      </span>
    </li>
  );
}

export default function SettingsPage() {
  const e = config.economics;
  // Only booleans about key presence are rendered — never key values.
  const astraKey = config.openai.apiKey.length > 0;
  const hfKey = config.higgsfield.apiKeyId.length > 0 && config.higgsfield.apiKeySecret.length > 0;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Workspace / Autonomy & connections"
        title="How far the agent may go."
        subtitle="Read from server-side environment variables. Change them in .env.local and restart; keys are never sent to the browser."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Connections">
          {config.mockMode ? (
            <p className="mb-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-[13px]">
              <FlaskConical className="size-4" /> Mock mode is on — no external calls are made.
            </p>
          ) : null}
          <ul className="divide-y">
            <Conn name={`Brief analysis · ${config.openai.model}`} ok={astraLive()} detail={astraKey ? (astraLive() ? "Live" : "Key present · disabled by mock mode") : "No OPENAI_API_KEY · offline analyzer in use"} />
            <Conn name="Generation · Higgsfield" ok={higgsfieldLive()} detail={hfKey ? (config.mockMode ? "Keys present · disabled by mock mode" : "Live") : "No HF_API_KEY_ID / HF_API_KEY_SECRET · simulated provider in use"} />
            <Conn name={`Database · ${config.databasePath}`} ok detail="SQLite behind the repository layer" />
          </ul>
          <Link href="/settings/connection-test" className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-foreground hover:bg-accent/80">
            <PlugZap className="size-3.5" /> Run a provider connection test
          </Link>
        </Card>
        <Card title="Autonomy rules">
          <ul className="flex flex-col gap-3 text-[13.5px]">
            <li>Nothing is generated before you approve the workflow and a maximum generation budget.</li>
            <li>After approval the agent runs steps only while committed spend plus the next estimate fits under the cap.</li>
            <li>Revisions that fit the remaining cap are auto-approved; scope changes and overruns stop for you.</li>
            <li>Rights concerns must be cleared before approval. Final delivery always needs you.</li>
          </ul>
          <dl className="tnum mt-5 grid grid-cols-3 gap-4 border-t pt-4 text-[13px]">
            <div><dt className="text-muted-foreground">Contingency</dt><dd className="mt-1 text-lg font-semibold">{pct(e.defaultContingencyPct)}</dd></div>
            <div><dt className="text-muted-foreground">Margin target</dt><dd className="mt-1 text-lg font-semibold">{pct(e.minGrossMarginPct)}</dd></div>
            <div><dt className="text-muted-foreground">Reject below</dt><dd className="mt-1 text-lg font-semibold">{pct(e.rejectBelowMarginPct)}</dd></div>
          </dl>
        </Card>
        <Card title="Channel fees">
          <ul className="tnum grid grid-cols-2 gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-3">
            {(Object.keys(e.sourceFeePct) as JobSource[]).map((s) => (
              <li key={s} className="flex justify-between border-b py-1.5"><span className="text-muted-foreground">{SOURCE_LABEL[s]}</span><span className="font-medium">{pct(e.sourceFeePct[s], 1)}</span></li>
            ))}
          </ul>
        </Card>
        <Card title="Marketplaces stay manual">
          <p className="flex items-start gap-2 text-[13.5px] text-muted-foreground"><Store className="mt-0.5 size-4 shrink-0" /> Studio Operator never scrapes, proposes, accepts, messages or delivers on a marketplace. There are no approved integrations.</p>
          <ul className="mt-3 flex flex-col gap-1.5 text-[13px]">
            {[...MANUAL_MARKETPLACE_STEPS.before, ...MANUAL_MARKETPLACE_STEPS.after].map((s) => <li key={s.action}>· {s.label}</li>)}
          </ul>
        </Card>
      </div>
      {config.mockMode ? (
        <form action={resetDemoAction} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-6 py-4">
          <span className="text-[13px] text-muted-foreground">Wipe local data and reseed the demo jobs.</span>
          <Button variant="outline" type="submit"><RotateCcw /> Reset demo data</Button>
        </form>
      ) : null}
    </div>
  );
}
