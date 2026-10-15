import * as React from "react";

export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[34px]">{title}</h1>
        {subtitle ? <p className="mt-2.5 max-w-2xl text-[14px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}
