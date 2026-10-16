import * as React from "react";
import { cn } from "@/lib/utils";

export function Section({ title, aside, children, className }: { title: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]", className)}>
      <div className="flex items-center justify-between gap-2 border-b px-6 py-4">
        <h3 className="text-[14.5px] font-semibold">{title}</h3>
        {aside}
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

export function Dl({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[13px]">
      {items.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0">{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function ListOrEmpty({ items, empty, render }: { items: string[]; empty: string; render?: (s: string, i: number) => React.ReactNode }) {
  if (!items.length) return <p className="text-[13px] text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col gap-1.5 text-[13px]">
      {items.map((s, i) => (
        <li key={i} className="flex gap-2">
          {render ? render(s, i) : (
            <>
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
              <span>{s}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
