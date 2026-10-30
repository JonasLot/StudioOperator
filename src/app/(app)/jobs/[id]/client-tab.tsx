"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { createClientLinkAction, revokeClientLinkAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { InvoiceStatusPill } from "@/components/billing";
import { CreateInvoiceButton } from "@/components/create-invoice-button";
import { displayStatus, invoiceTotal, type Invoice } from "@/lib/domain/invoice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ClientFeedback, ClientFeedbackKind, ClientShare, Job } from "@/lib/domain/types";
import { dateTime, shortDate, usd } from "@/lib/utils";
import { Section } from "./section";

const KIND: Record<ClientFeedbackKind, { label: string; variant: "ok" | "info" | "warn" | "outline" }> = {
  approve: { label: "Approved a delivery", variant: "ok" },
  brief_ok: { label: "Brief confirmed", variant: "ok" },
  change: { label: "Change request", variant: "info" },
  brief_change: { label: "Brief correction", variant: "warn" },
  answer: { label: "Answer", variant: "outline" },
  comment: { label: "Note", variant: "outline" },
};

export type JobBilling = { invoices: Invoice[]; clientKey: string; unbilled: number; blockedReason: string | null; today: string };

export function ClientTab({ job, share, feedback, billing }: { job: Job; share: ClientShare | null; feedback: ClientFeedback[]; billing: JobBilling }) {
  const [copied, setCopied] = React.useState(false);
  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const url = share ? `${origin}/c/${share.token}` : "";
  const manual = job.source === "upwork" || job.source === "fiverr" || job.source === "contra";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the link is selectable in the field */
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title="Client link" aside={share ? <Badge variant="ok">Live</Badge> : <Badge variant="outline">Not created</Badge>}>
        {share ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Client link" className="h-9 min-w-0 flex-1 rounded-md border bg-muted/40 px-3 font-mono text-[12.5px]" />
              <Button size="sm" variant="outline" onClick={copy} disabled={!origin}>
                {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink /> Preview
                </a>
              </Button>
            </div>
            <p className="text-[13px] text-muted-foreground">
              The client sees the brief as understood, open questions, and only the takes you have <span className="font-medium text-foreground">approved</span> on the{" "}
              <Link href={`/jobs/${job.id}/outputs/review`} className="underline underline-offset-2">
                review board
              </Link>
              . Costs, margins, prompts and QA notes are never shown.
              {share.lastViewedAt ? ` Last opened ${dateTime(share.lastViewedAt)}.` : " Not opened yet."}
            </p>
            {manual ? <p className="rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn">This job came through a marketplace: paste the link into the platform chat yourself — it is never sent automatically.</p> : null}
            <div>
              <ActionButton size="sm" variant="ghost" action={() => revokeClientLinkAction(job.id)} confirm="Revoke this link? Anyone holding it loses access immediately.">
                Revoke link
              </ActionButton>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-[13px] text-muted-foreground">Give the client one page for this job: the brief to confirm, questions to answer, and your approved takes to approve or comment on. No account needed.</p>
            <ActionButton size="sm" action={() => createClientLinkAction(job.id)}>
              <Link2 /> Create client link
            </ActionButton>
          </div>
        )}
      </Section>

      <Section
        title="Invoices"
        aside={
          <Link href={`/clients/${billing.clientKey}`} className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
            {job.clientName ?? "Unnamed client"} <ArrowUpRight className="size-3.5" />
          </Link>
        }
      >
        <div className="flex flex-col gap-4">
          {billing.invoices.length ? (
            <ul className="flex flex-col divide-y rounded-lg border">
              {billing.invoices.map((inv) => (
                <li key={inv.id}>
                  <Link href={`/invoices/${inv.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/30">
                    <span className="tnum w-24 text-[13.5px] font-medium">{inv.number ?? "Draft"}</span>
                    <span className="text-[12.5px] text-muted-foreground">
                      {shortDate(inv.issueDate)} · due {shortDate(inv.dueDate)}
                    </span>
                    <span className="ml-auto flex items-center gap-3">
                      <span className="tnum text-[13.5px] font-semibold">{usd(invoiceTotal(inv), { cents: true })}</span>
                      <InvoiceStatusPill status={displayStatus(inv, billing.today)} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-muted-foreground">
              {job.status === "rejected" || (billing.blockedReason && billing.unbilled === 0 && !billing.invoices.length)
                ? billing.blockedReason
                : billing.unbilled > 0
                  ? `${usd(billing.unbilled, { cents: true })} of the ${usd(job.budget, { cents: true })} client price is not on an invoice yet.`
                  : "The full client price is invoiced."}
              {manual && job.status !== "rejected" ? " The marketplace bills this client; an invoice here is your own record." : ""}
            </p>
            {job.status !== "rejected" && billing.unbilled > 0 ? <CreateInvoiceButton jobId={job.id} blockedReason={billing.blockedReason} /> : null}
          </div>
        </div>
      </Section>

      <Section title="From the client" aside={feedback.length ? <span className="tnum text-[12px] text-muted-foreground">{feedback.length}</span> : null}>
        {feedback.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Nothing yet. Answers, approvals and change requests appear here as they come in.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {feedback
              .slice()
              .reverse()
              .map((f) => (
                <li key={f.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={KIND[f.kind].variant}>{KIND[f.kind].label}</Badge>
                    <span className="text-[12px] text-muted-foreground">{dateTime(f.createdAt)}</span>
                    {f.revisionId ? (
                      <Link href={`/jobs/${job.id}?tab=revisions`} className="text-[12px] text-info underline-offset-2 hover:underline">
                        Logged as revision →
                      </Link>
                    ) : null}
                  </div>
                  {f.kind === "answer" && f.ref ? <p className="text-[12.5px] text-muted-foreground">{f.ref}</p> : null}
                  {f.body ? <p className="whitespace-pre-wrap text-[13.5px]">{f.body}</p> : null}
                </li>
              ))}
          </ul>
        )}
        {feedback.some((f) => f.kind === "change" && !f.revisionId) ? (
          <p className="mt-4 text-[12.5px] text-muted-foreground">Change requests are logged as revisions automatically while the job is in QA; otherwise log them from the Revisions tab.</p>
        ) : null}
      </Section>
    </div>
  );
}
