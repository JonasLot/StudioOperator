// Invoices: what a client was billed for a job. Pure rules so tests can import them.
//
// An invoice is a record the operator keeps; the app never sends it. Lifecycle:
//   draft → sent → paid
//   draft | sent → void
// Only drafts can be edited or deleted. A draft has no number; the next number in the year is
// assigned when it is marked as sent, so deleted drafts never leave gaps. Overdue is derived
// (sent and past due), never stored.

import type { Job, JobStatus } from "./types";

export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
/** What screens show: the stored status, plus "overdue" for a sent invoice past its due date. */
export type InvoiceDisplayStatus = InvoiceStatus | "overdue";

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number; // USD
}

export interface Invoice {
  id: string;
  number: string | null; // e.g. "2026-004": given when the invoice is sent, so sent invoices number without gaps
  jobId: string;
  clientKey: string;
  clientName: string; // as billed; stays put if the job's client is renamed later
  status: InvoiceStatus;
  lines: InvoiceLine[];
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  notes: string | null;
  // Snapshots taken when the invoice is marked as sent, so later edits to the profile or the
  // client's billing details never change an invoice that has left the studio. Null on drafts.
  sender: string | null; // studio name + invoice sender details
  billTo: string | null; // the client's billing details
  sentAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const INVOICE_STATUS_LABEL: Record<InvoiceDisplayStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  overdue: "Overdue",
  paid: "Paid",
  void: "Void",
};

export const DEFAULT_PAYMENT_TERMS_DAYS = 14;

const round = (n: number) => Math.round(n * 100) / 100;

export function lineTotal(l: InvoiceLine): number {
  return round(l.quantity * l.unitPrice);
}

export function invoiceTotal(inv: Pick<Invoice, "lines">): number {
  return round(inv.lines.reduce((a, l) => a + lineTotal(l), 0));
}

/** YYYY-MM-DD in local time. */
export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + days));
}

export function displayStatus(inv: Pick<Invoice, "status" | "dueDate">, today: string): InvoiceDisplayStatus {
  if (inv.status === "sent" && inv.dueDate < today) return "overdue";
  return inv.status;
}

/** Next number for `year`: one above the highest number already used that year, three digits minimum. */
export function nextInvoiceNumber(existing: (string | null)[], year: number): string {
  const prefix = `${year}-`;
  const max = existing
    .filter((n): n is string => !!n && n.startsWith(prefix))
    .map((n) => Number(n.slice(prefix.length)))
    .filter((n) => Number.isInteger(n) && n > 0)
    .reduce((a, n) => Math.max(a, n), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/** What counts as billed: everything except voided invoices. */
export function billedTotal(invoices: Pick<Invoice, "status" | "lines">[]): number {
  return round(invoices.filter((i) => i.status !== "void").reduce((a, i) => a + invoiceTotal(i), 0));
}

/** Accepted work: approved for production or further. Leads still in intake are not billable yet. */
export const BILLABLE_STATUSES = ["approved", "generating", "qa", "delivered"] as const satisfies readonly JobStatus[];

export function isBillable(status: JobStatus): boolean {
  return (BILLABLE_STATUSES as readonly JobStatus[]).includes(status);
}

/** The part of the agreed client price not yet on an invoice. Zero for work that is not accepted. Never negative. */
export function unbilledForJob(job: Pick<Job, "budget" | "status">, invoices: Pick<Invoice, "status" | "lines">[]): number {
  if (!isBillable(job.status)) return 0;
  return Math.max(0, round(job.budget - billedTotal(invoices)));
}

/** Why a job cannot get a new invoice, or null when it can. */
export function cannotInvoice(job: Pick<Job, "budget" | "status">, invoices: Pick<Invoice, "status" | "lines">[]): string | null {
  if (job.status === "rejected") return "Rejected jobs are not invoiced.";
  if (!isBillable(job.status)) return "Approve the job for production before invoicing it.";
  if (unbilledForJob(job, invoices) <= 0) return "The full client price is already invoiced. Void an invoice to bill it again.";
  return null;
}

export interface InvoiceTotals {
  invoiced: number; // sent + paid
  paid: number;
  outstanding: number; // sent, not yet paid (overdue included)
  overdue: number;
  drafts: number;
}

export function invoiceTotals(invoices: Pick<Invoice, "status" | "lines" | "dueDate">[], today: string): InvoiceTotals {
  const t: InvoiceTotals = { invoiced: 0, paid: 0, outstanding: 0, overdue: 0, drafts: 0 };
  for (const inv of invoices) {
    const total = invoiceTotal(inv);
    const s = displayStatus(inv, today);
    if (s === "draft") t.drafts += total;
    if (s === "sent" || s === "overdue" || s === "paid") t.invoiced += total;
    if (s === "paid") t.paid += total;
    if (s === "sent" || s === "overdue") t.outstanding += total;
    if (s === "overdue") t.overdue += total;
  }
  return { invoiced: round(t.invoiced), paid: round(t.paid), outstanding: round(t.outstanding), overdue: round(t.overdue), drafts: round(t.drafts) };
}

export type InvoiceAction = "edit" | "send" | "pay" | "void" | "delete";

export function canDo(action: InvoiceAction, status: InvoiceStatus): boolean {
  switch (action) {
    case "edit":
    case "delete":
    case "send":
      return status === "draft";
    case "pay":
      return status === "sent";
    case "void":
      return status === "draft" || status === "sent";
  }
}

export type LinesResult = { ok: true; lines: InvoiceLine[] } | { ok: false; error: string };

/** Clean up lines typed in the editor: drop blank rows, require a description, positive quantity and a price. */
export function validateLines(input: unknown): LinesResult {
  if (!Array.isArray(input)) return { ok: false, error: "Add at least one line." };
  const lines: InvoiceLine[] = [];
  for (const raw of input) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const description = typeof r.description === "string" ? r.description.replace(/\s+/g, " ").trim() : "";
    const quantity = Number(r.quantity);
    const unitPrice = Number(r.unitPrice);
    const blank = !description && (!Number.isFinite(unitPrice) || unitPrice === 0);
    if (blank) continue;
    if (!description) return { ok: false, error: "Every line needs a description." };
    if (description.length > 200) return { ok: false, error: "Keep line descriptions under 200 characters." };
    if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: `“${description}”: quantity must be above zero.` };
    if (!Number.isFinite(unitPrice)) return { ok: false, error: `“${description}”: add a price.` };
    lines.push({ description, quantity: round(quantity), unitPrice: round(unitPrice) });
  }
  if (!lines.length) return { ok: false, error: "Add at least one line." };
  if (lines.length > 30) return { ok: false, error: "Keep an invoice under 30 lines." };
  if (invoiceTotal({ lines }) <= 0) return { ok: false, error: "The invoice total must be above zero." };
  return { ok: true, lines };
}

/** How an invoice is named on screen: its number, or "Draft" before it has one. */
export function invoiceLabel(inv: Pick<Invoice, "number">): string {
  return inv.number ? `Invoice ${inv.number}` : "Draft invoice";
}
