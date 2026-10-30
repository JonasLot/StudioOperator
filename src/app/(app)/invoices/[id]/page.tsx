import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { InvoiceStatusPill } from "@/components/billing";
import { displayStatus, invoiceLabel, invoiceTotal, lineTotal } from "@/lib/domain/invoice";
import { getInvoice } from "@/lib/services/clients";
import { loadRuntimeConfig } from "@/lib/runtime-config";
import { cn, dateTime, longDate, usd } from "@/lib/utils";
import { InvoiceActions } from "./invoice-actions";
import { InvoiceEditor } from "./invoice-editor";

export const dynamic = "force-dynamic";

const money = (n: number) => usd(n, { cents: true });

export default async function InvoicePage(props: PageProps<"/invoices/[id]">) {
  await loadRuntimeConfig();
  const { id } = await props.params;
  const data = await getInvoice(id);
  if (!data) notFound();
  const { invoice: inv, job, sender, billTo, senderMissing, today } = data;
  const status = displayStatus(inv, today);
  const total = invoiceTotal(inv);
  const [senderName, ...senderLines] = sender.split("\n");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 print:hidden">
        <Link href={`/clients/${inv.clientKey}`} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> {inv.clientName}
        </Link>
        {job ? (
          <Link href={`/jobs/${job.id}?tab=client`} className="text-[13px] text-muted-foreground hover:text-foreground">
            Job: {job.title}
          </Link>
        ) : null}
      </div>

      <header className="flex flex-wrap items-end justify-between gap-6 print:hidden">
        <div>
          <p className="eyebrow">Workspace / Clients / Invoice</p>
          <h1 className="mt-3 flex flex-wrap items-center gap-3 text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[34px]">
            {invoiceLabel(inv)}
            <InvoiceStatusPill status={status} className="text-[13px]" />
          </h1>
          <p className="mt-2.5 text-[14px] text-muted-foreground">
            {inv.status === "draft" && "Edit the lines and dates, then mark it as sent when it has gone to the client. It gets its number then."}
            {inv.status === "sent" && `Marked as sent ${dateTime(inv.sentAt)}. Due ${longDate(inv.dueDate)}.`}
            {inv.status === "paid" && `Paid ${dateTime(inv.paidAt)}.`}
            {inv.status === "void" && `Voided ${dateTime(inv.voidedAt)}. It no longer counts as billed, so the job can be invoiced again.`}
          </p>
        </div>
        <InvoiceActions id={inv.id} status={inv.status} clientKey={inv.clientKey} />
      </header>

      {inv.status === "draft" ? (
        <div className="flex flex-col gap-3 print:hidden">
          {senderMissing ? (
            <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-4 py-2.5 text-[13px] text-warn">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Your sender details are empty, so the invoice only shows the studio name. Add org number, address and payment details on your{" "}
                <Link href="/profile" className="underline underline-offset-2">
                  profile
                </Link>
                .
              </span>
            </p>
          ) : null}
          {!billTo ? (
            <p className="flex items-start gap-2 rounded-lg bg-muted px-4 py-2.5 text-[13px] text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                No billing address for this client yet. Add it on the{" "}
                <Link href={`/clients/${inv.clientKey}`} className="underline underline-offset-2">
                  client page
                </Link>
                .
              </span>
            </p>
          ) : null}
          <InvoiceEditor
            id={inv.id}
            defaults={{
              clientName: inv.clientName,
              issueDate: inv.issueDate,
              dueDate: inv.dueDate,
              notes: inv.notes ?? "",
              lines: inv.lines.map((l) => ({ description: l.description, quantity: String(l.quantity), unitPrice: String(l.unitPrice) })),
            }}
            jobPrice={job?.budget ?? null}
          />
        </div>
      ) : null}

      {/* The document itself: paper-white in both themes, and the only thing that prints. */}
      <article
        aria-label="Invoice document"
        className="mx-auto w-full max-w-[820px] rounded-xl border bg-white px-8 py-10 text-[13.5px] text-neutral-900 shadow-[0_1px_3px_rgb(0_0_0/0.06)] sm:px-14 sm:py-14 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
      >
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="min-w-0">
            <p className="text-[22px] font-semibold tracking-[-0.02em]">{senderName}</p>
            {senderLines.length ? <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-neutral-600">{senderLines.join("\n")}</p> : null}
          </div>
          <div className="text-right">
            <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-neutral-500">Invoice</p>
            <p className="tnum mt-1 text-[20px] font-semibold">{inv.number ?? "Draft"}</p>
          </div>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Bill to</p>
            <p className="mt-2 font-medium">{inv.clientName}</p>
            {billTo ? <p className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-neutral-600">{billTo}</p> : null}
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1.5 text-[12.5px] sm:justify-end">
            <dt className="text-neutral-500">Invoice no.</dt>
            <dd className="tnum text-right">{inv.number ?? "—"}</dd>
            <dt className="text-neutral-500">Issue date</dt>
            <dd className="tnum text-right">{longDate(inv.issueDate)}</dd>
            <dt className="text-neutral-500">Due date</dt>
            <dd className={cn("tnum text-right", status === "overdue" && "font-semibold text-red-700")}>{longDate(inv.dueDate)}</dd>
            {job ? (
              <>
                <dt className="text-neutral-500">Reference</dt>
                <dd className="max-w-[220px] text-right">{job.title}</dd>
              </>
            ) : null}
          </dl>
        </div>

        <table className="mt-12 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-neutral-300 text-[10.5px] uppercase tracking-[0.14em] text-neutral-500">
              <th className="py-2.5 pr-4 font-semibold">Description</th>
              <th className="w-16 py-2.5 pr-4 text-right font-semibold">Qty</th>
              <th className="w-32 py-2.5 pr-4 text-right font-semibold">Unit price</th>
              <th className="w-32 py-2.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i} className="border-b border-neutral-200 align-top">
                <td className="py-3.5 pr-4">{l.description}</td>
                <td className="tnum py-3.5 pr-4 text-right">{l.quantity}</td>
                <td className="tnum py-3.5 pr-4 text-right">{money(l.unitPrice)}</td>
                <td className="tnum py-3.5 text-right">{money(lineTotal(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-6">
          <div>
            {status === "paid" || status === "void" ? (
              <span
                className={cn(
                  "inline-block rotate-[-6deg] rounded-md border-[3px] px-4 py-1 text-[22px] font-bold uppercase tracking-[0.18em]",
                  status === "paid" ? "border-emerald-700/50 text-emerald-700/70" : "border-neutral-400 text-neutral-500",
                )}
              >
                {status === "paid" ? "Paid" : "Void"}
              </span>
            ) : null}
          </div>
          <div className="min-w-[280px]">
            <div className="flex justify-between gap-8 pb-3">
              <span className="text-neutral-500">Subtotal</span>
              <span className="tnum">{money(total)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-8 border-t border-neutral-900 pt-3">
              <span className="font-semibold">Total due (USD)</span>
              <span className="tnum text-[18px] font-semibold">{money(total)}</span>
            </div>
          </div>
        </div>

        {inv.notes ? (
          <div className="mt-12">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Note</p>
            <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-neutral-700">{inv.notes}</p>
          </div>
        ) : null}

        <p className="mt-14 border-t border-neutral-200 pt-5 text-[12px] text-neutral-500">
          Please pay by {longDate(inv.dueDate)}{inv.number ? ` and mark the payment with invoice number ${inv.number}` : ""}. Thank you.
        </p>
      </article>
    </div>
  );
}
