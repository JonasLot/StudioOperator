import { Bot, Server, UserRound } from "lucide-react";
import type { ActivityEvent } from "@/lib/domain/types";
import { dateTime } from "@/lib/utils";

const ICON = { agent: Bot, operator: UserRound, system: Server };

export function ActivityLog({ events }: { events: ActivityEvent[] }) {
  return (
    <section className="rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]" aria-label="Activity">
      <div className="border-b px-5 py-3.5 text-[13px] font-semibold">Activity</div>
      <ol className="max-h-72 overflow-auto px-5 py-3">
        {events.slice(0, 40).map((e) => {
          const Icon = ICON[e.actor];
          return (
            <li key={e.id} className="flex gap-2 py-1.5 text-[12px]">
              <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="leading-snug">{e.message}</p>
                <p className="text-[10.5px] text-muted-foreground">{dateTime(e.createdAt)}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
