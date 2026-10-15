"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function useServerAction() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const exec = React.useCallback(
    (fn: () => Promise<ActionResult>, onOk?: () => void) => {
      setError(null);
      start(async () => {
        const r = await fn();
        if (!r.ok) setError(r.error);
        else {
          onOk?.();
          router.refresh();
        }
      });
    },
    [router],
  );
  return { pending, error, exec, setError };
}

export function ActionButton({
  action,
  children,
  className,
  confirm,
  errorClassName,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick" | "action"> & {
  action: () => Promise<ActionResult>;
  confirm?: string;
  errorClassName?: string;
}) {
  const { pending, error, exec } = useServerAction();
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        {...props}
        className={className}
        disabled={pending || props.disabled}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          exec(action);
        }}
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        {children}
      </Button>
      {error ? <span className={cn("text-xs text-bad max-w-72", errorClassName)}>{error}</span> : null}
    </span>
  );
}

export function InlineError({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="text-xs text-bad">{error}</p>;
}
