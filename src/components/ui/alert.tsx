import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-md border px-3 py-2.5 text-[13px] grid has-[>svg]:grid-cols-[16px_1fr] has-[>svg]:gap-x-2.5 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        warn: "bg-warn-soft border-warn/30 [&>svg]:text-warn",
        bad: "bg-bad-soft border-bad/30 [&>svg]:text-bad",
        ok: "bg-ok-soft border-ok/30 [&>svg]:text-ok",
        info: "bg-info-soft border-info/30 [&>svg]:text-info",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}
function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("col-start-2 font-medium", className)} {...props} />;
}
function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("col-start-2 text-muted-foreground text-[13px] [&_p]:leading-relaxed", className)} {...props} />;
}
export { Alert, AlertTitle, AlertDescription };
