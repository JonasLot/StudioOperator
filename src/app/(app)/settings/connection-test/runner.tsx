"use client";

import * as React from "react";
import { CheckCircle2, CircleSlash, Loader2, PlugZap } from "lucide-react";
import { connectionTestAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function ConnectionTestRunner({ live }: { live: boolean }) {
  const [state, setState] = React.useState<{ ok: boolean; detail: string } | null>(null);
  const [pending, start] = React.useTransition();

  const run = () => {
    const message = live
      ? "This makes the smallest documented authenticated request to the live provider and may incur a tiny charge. Continue?"
      : "Run the mock connection test? No network call is made and there is no cost.";
    if (!window.confirm(message)) return;
    start(async () => {
      const r = await connectionTestAction();
      setState({ ok: r.ok, detail: r.detail ?? (r.ok ? (r.message ?? "OK") : r.error) });
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Button className="w-fit" disabled={pending} onClick={run}>
        {pending ? <Loader2 className="animate-spin" /> : <PlugZap />} Run connection test
      </Button>
      {state ? (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px] ${state.ok ? "bg-ok-soft" : "bg-bad-soft"}`}>
          {state.ok ? <CheckCircle2 className="mt-0.5 size-4 text-ok" /> : <CircleSlash className="mt-0.5 size-4 text-bad" />}
          <span className="min-w-0 break-words">{state.detail}</span>
        </div>
      ) : null}
    </div>
  );
}
