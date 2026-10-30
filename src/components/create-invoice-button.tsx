"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Receipt } from "lucide-react";
import { createInvoiceAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Drafts an invoice for the part of the job's price not yet invoiced, then opens it. */
export function CreateInvoiceButton({ jobId, blockedReason, className, size = "sm", variant = "outline" }: { jobId: string; blockedReason: string | null; className?: string } & Pick<React.ComponentProps<typeof Button>, "size" | "variant">) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        size={size}
        variant={variant}
        className={className}
        disabled={pending || !!blockedReason}
        title={blockedReason ?? undefined}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await createInvoiceAction(jobId);
            if (!r.ok) setError(r.error);
            else if (r.id) router.push(`/invoices/${r.id}`);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Receipt />} Create invoice
      </Button>
      {error ? <span className={cn("max-w-72 text-xs text-bad")}>{error}</span> : null}
    </span>
  );
}
