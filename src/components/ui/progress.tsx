import * as React from "react";
import { cn } from "@/lib/utils";

function Progress({ value = 0, className, indicatorClassName }: { value?: number; className?: string; indicatorClassName?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div data-slot="progress" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full bg-foreground/80 transition-all", indicatorClassName)} style={{ width: `${v}%` }} />
    </div>
  );
}
export { Progress };
