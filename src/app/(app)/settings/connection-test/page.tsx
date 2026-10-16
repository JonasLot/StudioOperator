import Link from "next/link";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { providerInfo } from "@/lib/services/studio";
import { ConnectionTestRunner } from "./runner";

export const dynamic = "force-dynamic";

export default function ConnectionTestPage() {
  const p = providerInfo();
  const caps = Object.entries(p.capabilities).filter(([, v]) => v).map(([k]) => k);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Link href="/settings" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Settings
      </Link>
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Connections</p>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Provider connection test</h1>
        <p className="text-[13px] text-muted-foreground">
          Makes the smallest documented request to confirm the generation provider is reachable and credentials work. It runs only when you confirm, and never prints any secret value.
        </p>
      </header>

      <section className="rounded-xl border bg-card p-4">
        <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-[13px]">
          <dt className="text-muted-foreground">Active provider</dt>
          <dd className="font-medium">{p.name} {p.live ? "(live)" : "(mock)"}</dd>
          <dt className="text-muted-foreground">Base URL</dt>
          <dd className="break-all">{p.baseUrl}</dd>
          <dt className="text-muted-foreground">Capabilities</dt>
          <dd>{caps.length ? caps.join(", ") : "none"}</dd>
        </dl>
      </section>

      {!p.live ? (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-[13px]">
          <FlaskConical className="mt-0.5 size-4 shrink-0" /> Mock mode is active — the test is free and offline. Set HF_API_KEY_ID / HF_API_KEY_SECRET (and turn off mock mode) to test the live provider.
        </p>
      ) : !p.wireEnabled ? (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">
          The live Higgsfield wire mapping is still unverified against the official docs, so live calls are disabled. The test will report that until the mapping is verified and HIGGSFIELD_WIRE_ENABLED=true is set.
        </p>
      ) : null}

      <section className="rounded-xl border bg-card p-4">
        <ConnectionTestRunner live={p.live} />
      </section>
    </div>
  );
}
