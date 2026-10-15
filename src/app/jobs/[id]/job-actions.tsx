"use client";

import { Play, RefreshCw, RotateCcw, Sparkles, X } from "lucide-react";
import { analyzeAction, reopenJobAction, rejectJobAction, retryStepAction, startProductionAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";

export function AnalyzeButton({ jobId, label = "Re-run analysis", variant = "default" }: { jobId: string; label?: string; variant?: "default" | "outline" }) {
  return (
    <ActionButton size="sm" variant={variant} action={() => analyzeAction(jobId)}>
      {label.startsWith("Re") ? <RefreshCw /> : <Sparkles />}
      {label}
    </ActionButton>
  );
}

export function RejectButton({ jobId }: { jobId: string }) {
  return (
    <ActionButton
      size="sm"
      variant="outline"
      confirm="Reject this job? Remember to decline it on the marketplace yourself."
      action={() => rejectJobAction(jobId, "Declined by operator.")}
    >
      <X /> Reject job
    </ActionButton>
  );
}

export function ReopenButton({ jobId }: { jobId: string }) {
  return (
    <ActionButton size="sm" variant="outline" action={() => reopenJobAction(jobId)}>
      <RotateCcw /> Reopen for review
    </ActionButton>
  );
}

export function StartProductionButton({ jobId }: { jobId: string }) {
  return (
    <ActionButton size="sm" action={() => startProductionAction(jobId)}>
      <Play /> Start production
    </ActionButton>
  );
}

export function RetryStepButton({ jobId, stepId }: { jobId: string; stepId: string }) {
  return (
    <ActionButton size="xs" variant="outline" action={() => retryStepAction(jobId, stepId)}>
      <RefreshCw /> Retry
    </ActionButton>
  );
}
