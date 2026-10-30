import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowUpRight, CircleCheck, Clock, Receipt, Wallet } from "lucide-react";
import { InvoiceStatusPill, KpiGrid } from "@/components/billing";
import { CreateInvoiceButton } from "@/components/create-invoice-button";
import { StatusPill } from "@/components/job-pipeline";
import { displayStatus, invoiceTotal, isBillable } from "@/lib/domain/invoice";
import { SOURCE_LABEL } from "@/lib/domain/types";
import { getClient, UNNAMED_KEY } from "@/lib/services/clients";
import { loadRuntimeConfig } from "@/lib/runtime-config";
import { cn, longDate, shortDate, usd } from "@/lib/utils";
import { BillingForm } from "./billing-form";

export const dynamic = "force-dynamic";

const MARKETPLACES = new Set(["upwork", "fiverr", "contra"]);

export default async function ClientPage(props: PageProps<"/clients/[key]">) {
  await loadRuntimeConfig();
  const { key } = await props.params;
  const client = await getClient(key);
  if (!client) notFound();
  const { summary, orders, invoices, memory, today } = client;
  const firstOrder = orders.reduce<string | null>((a, o) => (!a || o.job.createdAt < a ? o.job.createdAt : a), null);
  const viaMarketplace = orders.some((o) => MARKETPLACES.has(o.job.source));
  const jobTitle = new Map(orders.map((o) => [o.job.id, o.job.title]));

  return (
    <div className="flex flex-col gap-10">
      <Link href="/clients" className="-mb-3 inline-flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Clients
      </Link>

      <header>
        <p className="eyebrow">Workspace / Clients</p>
        <h1 className="mt-3 text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[36px]">{summary.name}</h1>
        <p className="mt-2.5 text-[14px] text-muted-foreground">
          {summary.jobs} order{summary.jobs === 1 ? "" : "s"}
          {firstOrder ? ` since ${longDate(firstOrder)}` : ""} · {summary.invoiceCount} invoice{summary.invoiceCount === 1 ? "" : "s"}
          {summary.activeJobs ? ` · ${summary.activeJobs} in progress` : ""}
        </p>
      </header>

      <KpiGrid
        label="Client billing"
        items={[
          { label: "Order value", value: usd(summary.orderValue, { cents: true }), sub: "Agreed price, rejected jobs excluded", icon: Wallet },
          { label: "Paid", value: usd(summary.totals.paid, { cents: true }), sub: `of ${usd(summary.totals.invoiced, { cents: true })} invoiced`, icon: CircleCheck, tone: summary.totals.paid > 0 ? "ok" : undefined },
          {
            label: "Outstanding",
            value: usd(summary.totals.outstanding, { cents: true }),
            sub: summary.totals.overdue ? `${usd(summary.totals.overdue, { cents: true })} overdue` : "Nothing overdue",
            icon: summary.totals.overdue ? AlertCircle : Clock,
            tone: summary.totals.overdue ? "bad" : undefined,
          },
          {
            label: "Not invoiced yet",
            value: usd(summary.unbilled, { cents: true }),
            sub: summary.totals.drafts ? `${usd(summary.totals.drafts, { cents: true })} in drafts` : "Accepted work with no invoice",
            icon: Receipt,
            tone: summary.unbilled > 0 ? "warn" : undefined,
          },
        ]}
      />

      <section aria-label="Orders" className="flex flex-col gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            Orders
            <span className="tnum rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{orders.length}</span>
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Every job for this client, newest first, and how much of each is invoiced.</p>
        </div>
        {viaMarketplace ? (
          <p className="rounded-lg bg-warn-soft px-4 py-2.5 text-[13px] text-warn">
            Some orders came through a marketplace. The platform bills and pays out those — an invoice here is your own record, and it is never sent anywhere.
          </p>
        ) : null}
        <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
          <div className="hidden grid-cols-[minmax(0,1fr)_130px_110px_120px_150px_150px] gap-4 border-b px-6 py-3.5 md:grid">
            {["Job", "Status", "Ordered", "Price", "Invoiced", ""].map((h) => (
              <span key={h} className="eyebrow text-[10.5px]">
                {h}
              </span>
            ))}
          </div>
          {orders.length === 0 ? <div className="px-6 py-10 text-center text-[13px] text-muted-foreground">No jobs left for this client.</div> : null}
          {orders.map((o) => (
            <div
              key={o.job.id}
              data-order={o.job.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b px-6 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_130px_110px_120px_150px_150px]"
            >
              <Link href={`/jobs/${o.job.id}?tab=client`} className="group min-w-0">
                <span className="flex items-center gap-1.5 truncate text-[14.5px] font-medium group-hover:underline group-hover:underline-offset-2">
                  {o.job.title}
                  <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/60" />
                </span>
                <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
                  {SOURCE_LABEL[o.job.source]}
                  {o.job.archivedAt ? " · archived" : ""}
                  {o.job.deliveredAt ? ` · delivered ${shortDate(o.job.deliveredAt)}` : ""}
                </span>
              </Link>
              <span>
                <StatusPill status={o.job.status} />
              </span>
              <span className="hidden text-[13.5px] text-muted-foreground md:block">{shortDate(o.job.createdAt)}</span>
              <span className="tnum hidden text-[14px] font-semibold md:block">{usd(o.job.budget, { cents: true })}</span>
              <span className="hidden text-[13px] md:block">
                {o.job.status === "rejected" ? (
                  <span className="text-muted-foreground">Not billable</span>
                ) : !isBillable(o.job.status) && !o.invoices.length ? (
                  <span className="text-muted-foreground">Not accepted yet</span>
                ) : (
                  <>
                    <span className="tnum">{usd(o.billed, { cents: true })}</span>
                    <span className={cn("tnum block text-[11.5px]", o.unbilled > 0 ? "text-warn" : "text-muted-foreground")}>{o.unbilled > 0 ? `${usd(o.unbilled, { cents: true })} to invoice` : "Fully invoiced"}</span>
                  </>
                )}
              </span>
              <span className="col-span-2 flex items-center justify-between gap-3 md:col-span-1 md:justify-end">
                <span className="tnum text-[12px] text-muted-foreground md:hidden">
                  {usd(o.job.budget, { cents: true })} · {usd(o.billed, { cents: true })} invoiced
                </span>
                {o.job.status !== "rejected" && o.unbilled > 0 ? <CreateInvoiceButton jobId={o.job.id} blockedReason={o.blockedReason} /> : null}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Invoices" className="flex flex-col gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            Invoices
            <span className="tnum rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{invoices.length}</span>
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Drafts get a number when you mark them as sent. Open one to edit, print or save it as PDF.</p>
        </div>
        <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
          <div className="hidden grid-cols-[120px_minmax(0,1fr)_110px_110px_130px_100px_28px] gap-4 border-b px-6 py-3.5 md:grid">
            {["Invoice", "Job", "Issued", "Due", "Amount", "Status", ""].map((h) => (
              <span key={h} className="eyebrow text-[10.5px]">
                {h}
              </span>
            ))}
          </div>
          {invoices.length === 0 ? <div className="px-6 py-10 text-center text-[13px] text-muted-foreground">No invoices yet. Create one from an order above.</div> : null}
          {invoices.map((inv) => {
            const s = displayStatus(inv, today);
            return (
              <Link
                key={inv.id}
                href={`/invoices/${inv.id}`}
                data-invoice={inv.id}
                className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b px-6 py-4 transition-colors last:border-b-0 hover:bg-muted/30 md:grid-cols-[120px_minmax(0,1fr)_110px_110px_130px_100px_28px]"
              >
                <span className={cn("tnum text-[14px] font-medium", !inv.number && "text-muted-foreground")}>{inv.number ?? "Draft"}</span>
                <span className="order-last col-span-2 truncate text-[13px] text-muted-foreground md:order-none md:col-span-1">{jobTitle.get(inv.jobId) ?? "—"}</span>
                <span className="hidden text-[13.5px] text-muted-foreground md:block">{shortDate(inv.issueDate)}</span>
                <span className={cn("hidden text-[13.5px] md:block", s === "overdue" ? "text-bad" : "text-muted-foreground")}>{shortDate(inv.dueDate)}</span>
                <span className={cn("tnum hidden text-[14px] font-semibold md:block", s === "void" && "text-muted-foreground line-through")}>{usd(invoiceTotal(inv), { cents: true })}</span>
                <span className="flex items-center justify-end gap-2 md:justify-start">
                  <span className="tnum text-[13px] font-semibold md:hidden">{usd(invoiceTotal(inv), { cents: true })}</span>
                  <InvoiceStatusPill status={s} />
                </span>
                <ArrowUpRight className="hidden size-4 text-muted-foreground/60 transition-colors group-hover:text-foreground md:block" />
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-label="Billing details" className="max-w-2xl rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
        <div className="border-b px-6 py-4">
          <h2 className="text-[14.5px] font-semibold">Billing details</h2>
        </div>
        <div className="px-6 py-5">
          <BillingForm
            clientKey={summary.key}
            defaultValue={memory?.billingDetails ?? ""}
            disabledReason={summary.key === UNNAMED_KEY ? "These jobs have no client name. Add one on the job first, then billing details can be saved for that client." : null}
          />
        </div>
      </section>
    </div>
  );
}
