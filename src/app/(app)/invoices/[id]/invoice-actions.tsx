"use client";

import { useRouter } from "next/navigation";
import { Ban, CircleCheck, Printer, Send, Trash2 } from "lucide-react";
import { deleteDraftInvoiceAction, markInvoicePaidAction, markInvoiceSentAction, voidInvoiceAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { canDo, type InvoiceStatus } from "@/lib/domain/invoice";

export function InvoiceActions({ id, status, clientKey }: { id: string; status: InvoiceStatus; clientKey: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-start gap-2">
      <Button size="sm" variant="outline" className="h-9" onClick={() => window.print()}>
        <Printer /> Print / PDF
      </Button>
      {canDo("delete", status) ? (
        <ActionButton
          size="sm"
          variant="ghost"
          className="h-9"
          confirm="Delete this draft? It has no number yet, so nothing is lost from your records."
          action={async () => {
            const r = await deleteDraftInvoiceAction(id);
            if (r.ok) router.replace(`/clients/${clientKey}`);
            return r;
          }}
        >
          <Trash2 /> Delete draft
        </ActionButton>
      ) : null}
      {canDo("void", status) && status !== "draft" ? (
        <ActionButton size="sm" variant="ghost" className="h-9" confirm="Void this invoice? It stays on record with its number but no longer counts as billed." action={() => voidInvoiceAction(id)}>
          <Ban /> Void
        </ActionButton>
      ) : null}
      {canDo("send", status) ? (
        <ActionButton
          size="sm"
          className="h-9"
          confirm="Mark as sent? The invoice gets its number and is locked. The app does not send anything — send the PDF to the client yourself."
          action={() => markInvoiceSentAction(id)}
        >
          <Send /> Mark as sent
        </ActionButton>
      ) : null}
      {canDo("pay", status) ? (
        <ActionButton size="sm" variant="approve" className="h-9" action={() => markInvoicePaidAction(id)}>
          <CircleCheck /> Mark as paid
        </ActionButton>
      ) : null}
    </div>
  );
}
