import Link from "next/link";
import { AlertCircle, ArrowUpRight, Building2, CircleDollarSign, Clock, Receipt, Search } from "lucide-react";
import { KpiGrid } from "@/components/billing";
import { PageHeader } from "@/components/page-header";
import { listClients } from "@/lib/services/clients";
import { loadRuntimeConfig } from "@/lib/runtime-config";
import { cn, shortDate, usd } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ClientsPage(props: PageProps<"/clients">) {
  await loadRuntimeConfig();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const all = await listClients();
  const query = q.trim().toLowerCase();
  const rows = query ? all.filter((c) => c.name.toLowerCase().includes(query)) : all;

  const sum = (f: (c: (typeof all)[number]) => number) => all.reduce((a, c) => a + f(c), 0);
  const outstanding = sum((c) => c.totals.outstanding);
  const overdue = sum((c) => c.totals.overdue);
  const overdueClients = all.filter((c) => c.totals.overdue > 0).length;
  const unbilled = sum((c) => c.unbilled);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Workspace / Clients"
        title="Clients"
        subtitle="Everyone you have taken a brief from: what they ordered, what you have invoiced, and what is still to be paid."
      />

      <KpiGrid
        label="Billing summary"
        items={[
          { label: "Clients", value: String(all.length), sub: `${all.filter((c) => c.activeJobs).length} with active jobs`, icon: Building2 },
          { label: "Outstanding", value: usd(outstanding, { cents: true }), sub: "Sent and not yet paid", icon: Clock },
          {
            label: "Overdue",
            value: usd(overdue, { cents: true }),
            sub: overdueClients ? `${overdueClients} client${overdueClients === 1 ? "" : "s"} past due` : "Nothing past due",
            icon: AlertCircle,
            tone: overdue > 0 ? "bad" : undefined,
          },
          { label: "Not invoiced yet", value: usd(unbilled, { cents: true }), sub: "Accepted work with no invoice", icon: Receipt, tone: unbilled > 0 ? "warn" : undefined },
        ]}
      />

      <section aria-label="Clients" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              All clients
              <span className="tnum rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{all.length}</span>
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">Newest order first. Archived jobs are included.</p>
          </div>
          <form action="/clients" className="relative w-full sm:w-64" role="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Find a client…"
              className="h-10 w-full rounded-lg border bg-card pl-9 pr-3 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"
            />
          </form>
        </div>

        <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
          <div className="hidden grid-cols-[minmax(0,1fr)_90px_130px_130px_130px_100px_28px] gap-4 border-b px-6 py-3.5 md:grid">
            {["Client", "Orders", "Order value", "Paid", "Outstanding", "Last order", ""].map((h) => (
              <span key={h} className="eyebrow text-[10.5px]">
                {h}
              </span>
            ))}
          </div>
          {rows.length === 0 ? (
            <div className="px-6 py-14 text-center text-[13px] text-muted-foreground">{query ? `No clients match “${q}”.` : "No clients yet — they appear here with their first job."}</div>
          ) : null}
          {rows.map((c) => (
            <Link
              key={c.key}
              href={`/clients/${c.key}`}
              data-client={c.key}
              className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b px-6 py-4 transition-colors last:border-b-0 hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_90px_130px_130px_130px_100px_28px]"
            >
              <span className="flex min-w-0 items-center gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-lg border bg-muted/50 text-[13px] font-semibold text-muted-foreground">{monogram(c.name)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[14.5px] font-medium">{c.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    {c.activeJobs ? `${c.activeJobs} active` : "No active jobs"}
                    {c.unbilled > 0 ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="text-warn">{usd(c.unbilled, { cents: true })} not invoiced</span>
                      </>
                    ) : null}
                  </span>
                </span>
              </span>
              <span className="tnum text-right text-[13.5px] text-muted-foreground md:text-left">{c.jobs}</span>
              <span className="tnum hidden text-[14px] font-semibold md:block">{usd(c.orderValue, { cents: true })}</span>
              <span className="tnum hidden text-[13.5px] md:block">{c.totals.paid ? usd(c.totals.paid, { cents: true }) : <span className="text-muted-foreground">—</span>}</span>
              <span className={cn("tnum hidden text-[13.5px] md:block", c.totals.overdue > 0 && "font-medium text-bad")}>
                {c.totals.outstanding ? usd(c.totals.outstanding, { cents: true }) : <span className="text-muted-foreground">—</span>}
                {c.totals.overdue > 0 ? <span className="block text-[11.5px] font-normal">{usd(c.totals.overdue, { cents: true })} overdue</span> : null}
              </span>
              <span className="hidden text-[13.5px] text-muted-foreground md:block">{shortDate(c.lastOrderAt)}</span>
              <ArrowUpRight className="hidden size-4 text-muted-foreground/60 transition-colors group-hover:text-foreground md:block" />
              <span className="col-span-2 flex flex-wrap items-center gap-x-3 text-[12px] text-muted-foreground md:hidden">
                <span>
                  <CircleDollarSign className="mr-1 inline size-3.5" />
                  {usd(c.orderValue, { cents: true })}
                </span>
                {c.totals.outstanding ? <span className={c.totals.overdue ? "text-bad" : ""}>{usd(c.totals.outstanding, { cents: true })} outstanding</span> : null}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function monogram(name: string) {
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
}
