"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, CircleCheck, Images, Play, ShieldCheck, Sparkles } from "lucide-react";
import { analyzeAction, archiveJobAction, startProductionAction, unarchiveJobAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import type { JobStatus } from "@/lib/domain/types";

const BIG = "h-11 rounded-lg px-5 text-[14px] shadow-sm";

/** The single most useful next step for this job, top-right like a document's primary action. */
export function PrimaryAction({ jobId, status, hasAnalysis, archived = false }: { jobId: string; status: JobStatus; hasAnalysis: boolean; archived?: boolean }) {
  if (archived) {
    return (
      <ActionButton variant="outline" className={BIG} action={() => unarchiveJobAction(jobId)}>
        <ArchiveRestore /> Restore to pipeline
      </ActionButton>
    );
  }
  if (status === "delivered" || status === "rejected") {
    return (
      <ActionButton variant="outline" className={BIG} action={() => archiveJobAction(jobId)}>
        <Archive /> Archive job
      </ActionButton>
    );
  }
  if (status === "new" || !hasAnalysis) {
    return (
      <ActionButton className={BIG} action={() => analyzeAction(jobId)}>
        <Sparkles /> Analyse brief
      </ActionButton>
    );
  }
  if (status === "needs_review") {
    return (
      <Button asChild className={BIG}>
        <a href="#approvals">
          <ShieldCheck /> Review & approve
        </a>
      </Button>
    );
  }
  if (status === "approved") {
    return (
      <ActionButton className={BIG} action={() => startProductionAction(jobId)}>
        <Play /> Start production
      </ActionButton>
    );
  }
  if (status === "generating") {
    return (
      <Button asChild variant="outline" className={BIG}>
        <Link href={`/jobs/${jobId}?tab=outputs`}>
          <Images /> Watch outputs
        </Link>
      </Button>
    );
  }
  if (status === "qa") {
    return (
      <Button asChild className={BIG}>
        <a href="#approvals">
          <CircleCheck /> Approve delivery
        </a>
      </Button>
    );
  }
  return null;
}
