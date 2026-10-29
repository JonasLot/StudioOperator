"use client";

import { Archive } from "lucide-react";
import { archiveClosedJobsAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";

/** Files every delivered or rejected job out of the pipeline in one go. */
export function ArchiveClosedButton({ count }: { count: number }) {
  if (!count) return null;
  return (
    <ActionButton
      size="sm"
      variant="outline"
      className="h-10 rounded-lg"
      confirm={`Archive ${count} closed job${count === 1 ? "" : "s"}? They move to the archive and can be restored at any time.`}
      action={archiveClosedJobsAction}
    >
      <Archive /> Archive closed ({count})
    </ActionButton>
  );
}
