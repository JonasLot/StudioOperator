"use client";

import * as React from "react";
import { Check, Loader2, Save } from "lucide-react";
import { saveClientBillingAction } from "@/app/actions";
import { useServerAction } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function BillingForm({ clientKey, defaultValue, disabledReason }: { clientKey: string; defaultValue: string; disabledReason: string | null }) {
  const [value, setValue] = React.useState(defaultValue);
  const [saved, setSaved] = React.useState(false);
  const { pending, error, exec } = useServerAction();
  const dirty = value.trim() !== defaultValue.trim();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        exec(() => saveClientBillingAction(clientKey, value), () => setSaved(true));
      }}
    >
      <Textarea
        aria-label="Billing details"
        rows={5}
        value={value}
        disabled={!!disabledReason}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        placeholder={"Company AS · Org. no. 987 654 321\nAttn: Ingrid Hansen\nStreet 2, 5003 Bergen\ninvoice@company.no"}
      />
      <p className="text-[12px] text-muted-foreground">{disabledReason ?? "Printed under “Bill to” on new and draft invoices. Sent invoices keep what they were sent with."}</p>
      {error ? <p className="text-[12.5px] text-bad">{error}</p> : null}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending || !dirty || !!disabledReason}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Save billing details
        </Button>
        {saved && !dirty ? (
          <span className="inline-flex items-center gap-1 text-[12.5px] text-ok">
            <Check className="size-3.5" /> Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}
