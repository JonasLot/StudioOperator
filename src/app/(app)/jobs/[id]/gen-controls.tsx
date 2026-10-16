"use client";

import { RefreshCw, X } from "lucide-react";
import { cancelGenerationAction, retryGenerationAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";

export function GenerationControls({ jobId, generationId, status, timedOut }: { jobId: string; generationId: string; status: string; timedOut: boolean }) {
  const canCancel = status === "queued";
  const canRetry = status === "failed" || status === "nsfw" || status === "canceled" || timedOut;
  if (!canCancel && !canRetry) return null;
  return (
    <span className="inline-flex gap-1">
      {canCancel ? (
        <ActionButton size="xs" variant="outline" confirm="Cancel this queued request?" action={() => cancelGenerationAction(jobId, generationId)}>
          <X /> Cancel
        </ActionButton>
      ) : null}
      {canRetry ? (
        <ActionButton size="xs" variant="outline" action={() => retryGenerationAction(jobId, generationId)}>
          <RefreshCw /> Retry
        </ActionButton>
      ) : null}
    </span>
  );
}
