"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { tickAction, tickAllAction } from "@/app/actions";

/**
 * While generation is in flight, advance the production loop and refresh the view.
 * In a deployed setup this is a background worker or Higgsfield webhook; for the local demo the
 * open tab drives it.
 */
export function ProductionPoller({ jobId, active, intervalMs = 2000 }: { jobId?: string; active: boolean; intervalMs?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    if (!active) return;
    let stopped = false;
    const id = window.setInterval(async () => {
      if (stopped) return;
      await (jobId ? tickAction(jobId) : tickAllAction());
      router.refresh();
    }, intervalMs);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [active, jobId, intervalMs, router]);
  return null;
}
