import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  billedTotal,
  canDo,
  cannotInvoice,
  displayStatus,
  invoiceTotal,
  invoiceTotals,
  nextInvoiceNumber,
  unbilledForJob,
  validateLines,
  type InvoiceStatus,
} from "./invoice";

const inv = (status: InvoiceStatus, amount: number, dueDate = "2026-11-10") => ({ status, dueDate, lines: [{ description: "Work", quantity: 1, unitPrice: amount }] });

test("totals add up quantity × price per line, rounded to cents", () => {
  assert.equal(invoiceTotal({ lines: [{ description: "a", quantity: 3, unitPrice: 0.1 }, { description: "b", quantity: 1, unitPrice: 1200 }] }), 1200.3);
});

test("invoice numbers count up within a year and restart the next", () => {
  assert.equal(nextInvoiceNumber([], 2026), "2026-001");
  assert.equal(nextInvoiceNumber(["2026-001", null, "2026-009", "2025-044"], 2026), "2026-010");
  assert.equal(nextInvoiceNumber(["2026-120"], 2027), "2027-001");
  assert.equal(nextInvoiceNumber(["2026-999"], 2026), "2026-1000");
});

test("a sent invoice past its due date shows as overdue; paid never does", () => {
  assert.equal(displayStatus({ status: "sent", dueDate: "2026-10-01" }, "2026-10-30"), "overdue");
  assert.equal(displayStatus({ status: "sent", dueDate: "2026-10-30" }, "2026-10-30"), "sent");
  assert.equal(displayStatus({ status: "paid", dueDate: "2026-10-01" }, "2026-10-30"), "paid");
  assert.equal(displayStatus({ status: "draft", dueDate: "2026-10-01" }, "2026-10-30"), "draft");
});

test("void invoices do not count as billed; the rest of the price stays billable", () => {
  const job = { budget: 1000, status: "delivered" as const };
  const invoices = [inv("paid", 400), inv("void", 600), inv("draft", 100)];
  assert.equal(billedTotal(invoices), 500);
  assert.equal(unbilledForJob(job, invoices), 500);
  assert.equal(cannotInvoice(job, invoices), null);
  assert.match(cannotInvoice(job, [inv("sent", 1000)]) ?? "", /already invoiced/);
  assert.equal(unbilledForJob(job, [inv("sent", 1200)]), 0);
});

test("rejected jobs are never invoiced", () => {
  assert.match(cannotInvoice({ budget: 500, status: "rejected" }, []) ?? "", /Rejected/);
  assert.equal(unbilledForJob({ budget: 500, status: "rejected" }, []), 0);
});

test("client totals split paid, outstanding and overdue; drafts stay out of invoiced", () => {
  const t = invoiceTotals([inv("paid", 100), inv("sent", 200, "2026-12-01"), inv("sent", 300, "2026-10-01"), inv("draft", 50), inv("void", 999)], "2026-10-30");
  assert.deepEqual(t, { invoiced: 600, paid: 100, outstanding: 500, overdue: 300, drafts: 50 });
});

test("only drafts can be edited, sent or deleted; only sent invoices can be paid; paid cannot be voided", () => {
  assert.equal(canDo("edit", "draft"), true);
  assert.equal(canDo("edit", "sent"), false);
  assert.equal(canDo("send", "sent"), false);
  assert.equal(canDo("pay", "sent"), true);
  assert.equal(canDo("pay", "draft"), false);
  assert.equal(canDo("void", "sent"), true);
  assert.equal(canDo("void", "paid"), false);
  assert.equal(canDo("delete", "paid"), false);
});

test("line validation drops blank rows and rejects incomplete ones", () => {
  const ok = validateLines([
    { description: "  Logo   design ", quantity: "1", unitPrice: "1500" },
    { description: "", quantity: 1, unitPrice: "" },
  ]);
  assert.deepEqual(ok, { ok: true, lines: [{ description: "Logo design", quantity: 1, unitPrice: 1500 }] });
  assert.equal(validateLines([]).ok, false);
  assert.equal(validateLines([{ description: "", quantity: 1, unitPrice: 10 }]).ok, false);
  assert.equal(validateLines([{ description: "x", quantity: 0, unitPrice: 10 }]).ok, false);
  assert.equal(validateLines([{ description: "Discount", quantity: 1, unitPrice: -50 }]).ok, false); // total must be positive
  assert.equal(validateLines([{ description: "Work", quantity: 1, unitPrice: 100 }, { description: "Discount", quantity: 1, unitPrice: -20 }]).ok, true);
});

test("due dates roll over month ends", () => {
  assert.equal(addDays("2026-10-30", 14), "2026-11-13");
  assert.equal(addDays("2026-12-25", 14), "2027-01-08");
});

test("leads still in intake are not billable yet", () => {
  for (const status of ["new", "needs_review"] as const) {
    assert.equal(unbilledForJob({ budget: 500, status }, []), 0);
    assert.match(cannotInvoice({ budget: 500, status }, []) ?? "", /Approve the job/);
  }
  assert.equal(unbilledForJob({ budget: 500, status: "approved" }, []), 500);
});
