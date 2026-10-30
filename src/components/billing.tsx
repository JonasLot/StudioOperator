import * as React from "react";
import Link from "next/link";
import { INVOICE_STATUS_LABEL, type InvoiceDisplayStatus } from "@/lib/domain/invoice";
import { cn } from "@/lib/utils";

const PILL: Record<InvoiceDisplayStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-info-soft text-info",
  overdue: "bg-bad-soft text-bad",
  paid: "bg-ok-soft text-ok",
  void: "bg-muted text-muted-foreground line-through",
};

export function InvoiceStatusPill({ status, className }: { status: InvoiceDisplayStatus; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-md px-2 py-1 text-[12px] font-medium whitespace-nowrap", PILL[status], className)}>{INVOICE_STATUS_LABEL[status]}</span>;
}

export type Kpi = { label: string; value: string; sub: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; tone?: "warn" | "bad" | "ok"; href?: string };

/** The same KPI cards as the Overview page. */
export function KpiGrid({ items, label }: { items: Kpi[]; label: string }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={label}>
      {items.map((k) => {
        const body = (
          <>
            <div className="flex items-start justify-between">
              <span className="text-[13px] text-muted-foreground">{k.label}</span>
              <k.icon className="size-[18px] text-muted-foreground/70" strokeWidth={1.6} />
            </div>
            <div className={cn("tnum mt-5 text-[30px] font-semibold leading-none tracking-[-0.02em]", k.tone === "warn" && "text-warn", k.tone === "bad" && "text-bad", k.tone === "ok" && "text-ok")}>{k.value}</div>
            <div className="mt-3 text-[12.5px] text-muted-foreground">{k.sub}</div>
          </>
        );
        const cls = "rounded-xl border bg-card p-6 shadow-[0_1px_2px_rgb(0_0_0/0.03)]";
        return k.href ? (
          <Link key={k.label} href={k.href} className={cn(cls, "transition-colors hover:border-foreground/20")}>
            {body}
          </Link>
        ) : (
          <div key={k.label} className={cls}>
            {body}
          </div>
        );
      })}
    </section>
  );
}
