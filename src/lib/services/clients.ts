import "server-only";
import type { ClientMemory, Job } from "@/lib/domain/types";
import {
  DEFAULT_PAYMENT_TERMS_DAYS,
  addDays,
  billedTotal,
  invoiceLabel,
  canDo,
  cannotInvoice,
  invoiceTotals,
  isoDay,
  nextInvoiceNumber,
  unbilledForJob,
  validateLines,
  type Invoice,
  type InvoiceAction,
  type InvoiceLine,
  type InvoiceTotals,
} from "@/lib/domain/invoice";
import { getRepo } from "@/lib/repo";
import { getProfile } from "@/lib/settings";
import { tidyBlock } from "@/lib/settings/rules";
import { clientKey, upsertClientMemory } from "./agency";
import { GuardrailError } from "./guardrails";
import { newId } from "./ids";

// ---------------------------------------------------------------------------
// Clients are not a table of their own: a client is every job that carries the same
// (normalized) client name, plus the account-level client memory and the invoices
// written for those jobs. Invoices are records the operator keeps — nothing is sent.
// ---------------------------------------------------------------------------

export const UNNAMED_KEY = "_unnamed";

export function keyForJob(job: Pick<Job, "clientName">): string {
  return (job.clientName?.trim() ? clientKey(job.clientName) : "") || UNNAMED_KEY;
}

const today = () => isoDay(new Date());
const now = () => new Date().toISOString();

export interface ClientSummary {
  key: string;
  name: string;
  jobs: number;
  activeJobs: number; // not delivered, rejected or archived
  lastOrderAt: string | null;
  orderValue: number; // agreed client price across non-rejected jobs
  unbilled: number; // price not yet on any invoice
  totals: InvoiceTotals;
  invoiceCount: number;
}

function byKey<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return m;
}

function summarize(key: string, jobs: Job[], invoices: Invoice[], memory: ClientMemory | undefined, day: string): ClientSummary {
  const invByJob = byKey(invoices, (i) => i.jobId);
  const newest = jobs.reduce<Job | null>((a, j) => (!a || j.createdAt > a.createdAt ? j : a), null);
  const named = jobs.find((j) => j.clientName?.trim());
  return {
    key,
    name: memory?.displayName ?? named?.clientName?.trim() ?? invoices[0]?.clientName ?? "Unnamed client",
    jobs: jobs.length,
    activeJobs: jobs.filter((j) => !j.archivedAt && j.status !== "delivered" && j.status !== "rejected").length,
    lastOrderAt: newest?.createdAt ?? null,
    orderValue: Math.round(jobs.filter((j) => j.status !== "rejected").reduce((a, j) => a + j.budget, 0) * 100) / 100,
    unbilled: Math.round(jobs.reduce((a, j) => a + unbilledForJob(j, invByJob.get(j.id) ?? []), 0) * 100) / 100,
    totals: invoiceTotals(invoices, day),
    invoiceCount: invoices.filter((i) => i.status !== "void").length,
  };
}

export async function listClients(): Promise<ClientSummary[]> {
  const repo = getRepo();
  const [jobs, invoices, memories] = await Promise.all([repo.listJobs(), repo.listInvoices(), repo.listClientMemory()]);
  const jobsByKey = byKey(jobs, keyForJob);
  const invByKey = byKey(invoices, (i) => i.clientKey);
  const memByKey = new Map(memories.map((m) => [m.clientKey, m]));
  const day = today();
  return [...jobsByKey.entries()]
    .map(([key, list]) => summarize(key, list, invByKey.get(key) ?? [], memByKey.get(key), day))
    .sort((a, b) => (b.lastOrderAt ?? "").localeCompare(a.lastOrderAt ?? ""));
}

export interface ClientOrder {
  job: Job;
  invoices: Invoice[];
  billed: number;
  unbilled: number;
  blockedReason: string | null; // why a new invoice cannot be made, or null
}

export async function getClient(key: string) {
  const repo = getRepo();
  const [allJobs, allInvoices, memory] = await Promise.all([repo.listJobs(), repo.listInvoices(), key === UNNAMED_KEY ? null : repo.getClientMemory(key)]);
  const jobs = allJobs.filter((j) => keyForJob(j) === key);
  const invoices = allInvoices.filter((i) => i.clientKey === key);
  if (!jobs.length && !invoices.length) return null;
  const invByJob = byKey(invoices, (i) => i.jobId);
  const orders: ClientOrder[] = jobs.map((job) => {
    const list = invByJob.get(job.id) ?? [];
    return { job, invoices: list, billed: billedTotal(list), unbilled: unbilledForJob(job, list), blockedReason: cannotInvoice(job, list) };
  });
  return { summary: summarize(key, jobs, invoices, memory ?? undefined, today()), memory, orders, invoices, today: today() };
}

export async function saveClientBilling(key: string, billingDetails: string) {
  if (key === UNNAMED_KEY) throw new GuardrailError("Give the jobs a client name first, then add billing details.");
  const client = await getClient(key);
  if (!client) throw new GuardrailError("Client not found.");
  const text = tidyBlock(billingDetails);
  if (text.length > 600) throw new GuardrailError("Keep billing details under 600 characters.");
  await upsertClientMemory({ displayName: client.summary.name, billingDetails: text || null });
}

// --- invoices ----------------------------------------------------------------

export async function listInvoicesForJob(jobId: string) {
  return await getRepo().listInvoicesForJob(jobId);
}

/** Who the invoice is from, as printed: the studio name, then the sender details from the profile. */
function currentSender(): string {
  const p = getProfile();
  return [p.studioName, p.billingDetails, p.email].filter(Boolean).join("\n");
}

async function currentBillTo(clientKeyValue: string): Promise<string | null> {
  if (clientKeyValue === UNNAMED_KEY) return null;
  return (await getRepo().getClientMemory(clientKeyValue))?.billingDetails ?? null;
}

/**
 * An invoice with what it prints: drafts show the current profile and client billing details;
 * anything sent shows the snapshot taken when it was sent.
 */
export async function getInvoice(id: string) {
  const repo = getRepo();
  const invoice = await repo.getInvoice(id);
  if (!invoice) return null;
  const draft = invoice.status === "draft";
  const [job, liveBillTo] = await Promise.all([repo.getJob(invoice.jobId), draft ? currentBillTo(invoice.clientKey) : null]);
  return {
    invoice,
    job,
    sender: draft ? currentSender() : (invoice.sender ?? ""),
    billTo: draft ? liveBillTo : invoice.billTo,
    senderMissing: draft && !getProfile().billingDetails,
    today: today(),
  };
}

async function log(jobId: string, message: string) {
  await getRepo().insertActivity({ id: newId("ev"), jobId, actor: "operator", message, createdAt: now() });
}

/** A draft for the part of the client price not yet invoiced. Numbers are assigned inside one transaction. */
export async function createInvoiceForJob(jobId: string): Promise<string> {
  const repo = getRepo();
  return await repo.transaction(async () => {
    const job = await repo.getJob(jobId);
    if (!job) throw new GuardrailError("Job not found.");
    const existing = await repo.listInvoicesForJob(jobId);
    const blocked = cannotInvoice(job, existing);
    if (blocked) throw new GuardrailError(blocked);
    const amount = unbilledForJob(job, existing);
    const partial = existing.some((i) => i.status !== "void");
    const issue = today();
    const lines: InvoiceLine[] = [{ description: partial ? `${job.title} — remaining balance` : job.title, quantity: 1, unitPrice: amount }];
    const inv: Invoice = {
      id: newId("inv"),
      number: null,
      jobId,
      clientKey: keyForJob(job),
      clientName: job.clientName?.trim() || "Unnamed client",
      status: "draft",
      lines,
      issueDate: issue,
      dueDate: addDays(issue, DEFAULT_PAYMENT_TERMS_DAYS),
      notes: null,
      sender: null,
      billTo: null,
      sentAt: null,
      paidAt: null,
      voidedAt: null,
      createdAt: now(),
      updatedAt: now(),
    };
    await repo.insertInvoice(inv);
    await log(jobId, `Drafted an invoice for ${amount.toFixed(2)} USD.`);
    return inv.id;
  });
}

async function load(id: string, action: InvoiceAction) {
  const inv = await getRepo().getInvoice(id);
  if (!inv) throw new GuardrailError("Invoice not found.");
  if (!canDo(action, inv.status)) {
    const what = { edit: "edited", send: "marked as sent", pay: "marked as paid", void: "voided", delete: "deleted" }[action];
    throw new GuardrailError(`A ${inv.status} invoice cannot be ${what}.`);
  }
  return inv;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function updateDraftInvoice(id: string, input: { lines: unknown; issueDate: string; dueDate: string; clientName: string; notes: string }) {
  const inv = await load(id, "edit");
  const lines = validateLines(input.lines);
  if (!lines.ok) throw new GuardrailError(lines.error);
  if (!DAY.test(input.issueDate) || !DAY.test(input.dueDate)) throw new GuardrailError("Pick an issue date and a due date.");
  if (input.dueDate < input.issueDate) throw new GuardrailError("The due date cannot be before the issue date.");
  const clientName = input.clientName.replace(/\s+/g, " ").trim();
  if (!clientName) throw new GuardrailError("Add who the invoice is to.");
  const notes = tidyBlock(input.notes);
  if (notes.length > 600) throw new GuardrailError("Keep the note under 600 characters.");
  await getRepo().updateInvoice(inv.id, { lines: lines.lines, issueDate: input.issueDate, dueDate: input.dueDate, clientName: clientName.slice(0, 120), notes: notes || null });
}

/** Gives the draft the next number in its issue year and records it as sent. The app does not send anything. */
export async function markInvoiceSent(id: string) {
  const repo = getRepo();
  await repo.transaction(async () => {
    const inv = await load(id, "send");
    const year = Number(inv.issueDate.slice(0, 4));
    const number = nextInvoiceNumber((await repo.listInvoices()).map((i) => i.number), year);
    await repo.updateInvoice(id, { status: "sent", number, sentAt: now(), sender: currentSender(), billTo: await currentBillTo(inv.clientKey) });
    await log(inv.jobId, `Marked invoice ${number} as sent.`);
  });
}

export async function markInvoicePaid(id: string) {
  const inv = await load(id, "pay");
  await getRepo().updateInvoice(id, { status: "paid", paidAt: now() });
  await log(inv.jobId, `Marked invoice ${inv.number} as paid.`);
}

export async function voidInvoice(id: string) {
  const inv = await load(id, "void");
  await getRepo().updateInvoice(id, { status: "void", voidedAt: now() });
  await log(inv.jobId, `Voided ${invoiceLabel(inv).toLowerCase()}.`);
}

/** Drafts can be thrown away; anything that has been sent stays on record (void it instead). */
export async function deleteDraftInvoice(id: string) {
  const inv = await load(id, "delete");
  await getRepo().deleteInvoice(id);
  await log(inv.jobId, "Deleted a draft invoice.");
  return inv;
}
