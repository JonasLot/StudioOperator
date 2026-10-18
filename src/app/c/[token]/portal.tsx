"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AudioLines, Check, Clock, Loader2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PortalData } from "@/lib/services/client-portal";
import type { FeedbackInput } from "@/lib/services/client-portal";
import { cn, dateTime, shortDate } from "@/lib/utils";
import { clientFeedbackAction } from "./actions";

/** One shared submit path: disables controls while sending, shows the error in place, refreshes the page data on success. */
function useSend(token: string) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const send = React.useCallback(
    (input: FeedbackInput, onOk?: () => void) => {
      setError(null);
      start(async () => {
        const r = await clientFeedbackAction(token, input);
        if (!r.ok) return setError(r.error);
        onOk?.();
        router.refresh();
      });
    },
    [token, router],
  );
  return { pending, error, send };
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.03)] sm:p-6">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {hint ? <p className="mt-1 text-[13px] text-muted-foreground">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Err({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="mt-2 text-[13px] text-bad">
      {message}
    </p>
  ) : null;
}

export function Portal({ token, data }: { token: string; data: PortalData }) {
  const closed = data.status === "delivered" || data.status === "rejected";
  const todo = data.waiting.questions + data.waiting.reviews;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6 sm:py-12">
      <header>
        <p className="eyebrow">{data.studioName}</p>
        <h1 className="mt-3 text-[28px] font-semibold leading-[1.12] tracking-[-0.03em] sm:text-[34px]">{data.title}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 text-[13px] text-muted-foreground">
          {data.clientName ? <span>Prepared for {data.clientName}</span> : null}
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5" strokeWidth={1.7} /> Due {shortDate(data.deadline)}
          </span>
        </p>
      </header>

      {data.stages ? (
        <ol aria-label="Progress" className="grid grid-cols-5 gap-1.5">
          {data.stages.map((s) => (
            <li key={s.key} aria-current={s.state === "current" ? "step" : undefined}>
              <div className={cn("h-1 rounded-full", s.state === "upcoming" ? "bg-muted" : s.state === "current" ? "bg-brand" : "bg-ok/70")} />
              <p className={cn("mt-1.5 text-[11.5px] leading-tight", s.state === "current" ? "font-medium text-foreground" : "text-muted-foreground")}>{s.label}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg bg-muted px-4 py-3 text-[13px] text-muted-foreground">This project is closed.</p>
      )}

      {!closed && todo > 0 ? (
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-[13.5px] font-medium text-warn">
          {[data.waiting.questions ? `${data.waiting.questions} ${data.waiting.questions === 1 ? "question" : "questions"} for you` : null, data.waiting.reviews ? `${data.waiting.reviews} ${data.waiting.reviews === 1 ? "delivery" : "deliveries"} to review` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}

      {data.deliveries.length ? (
        <Section title="For your review" hint="Approve what works, or tell us exactly what to change on each one.">
          <div className="flex flex-col gap-6">
            {data.deliveries.map((d) => (
              <Delivery key={d.id} token={token} d={d} locked={closed} />
            ))}
          </div>
        </Section>
      ) : null}

      {data.questions.length ? (
        <Section title="Questions for you" hint="A few details that shape the result and the timeline. Short answers are fine.">
          <div className="flex flex-col gap-5">
            {data.questions.map((q) => (
              <Question key={q.question} token={token} q={q} locked={closed} />
            ))}
          </div>
        </Section>
      ) : null}

      {data.brief ? (
        <Section title="The brief, as we understand it">
          <p className="text-[14px] leading-relaxed">{data.brief.summary}</p>
          {data.brief.deliverables.length ? (
            <ul className="mt-4 divide-y rounded-lg border">
              {data.brief.deliverables.map((d) => (
                <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-x-4 px-3.5 py-2.5 text-[13.5px]">
                  <span className="font-medium">{d.title}</span>
                  <span className="text-muted-foreground">{d.detail}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {data.brief.exactText.length ? (
            <div className="mt-4">
              <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">On-screen text, exactly as we’ll use it</p>
              <ul className="mt-1.5 flex flex-col gap-1 text-[13.5px]">
                {data.brief.exactText.map((t) => (
                  <li key={t} className="rounded-md bg-muted px-2.5 py-1.5">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.brief.brandConstraints.length ? (
            <div className="mt-4">
              <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Brand notes</p>
              <ul className="mt-1.5 list-disc pl-5 text-[13.5px] leading-relaxed">
                {data.brief.brandConstraints.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {!closed ? <BriefCheck token={token} confirmed={data.messages.some((m) => m.kind === "brief_ok")} /> : null}
        </Section>
      ) : null}

      {!closed ? (
        <Section title="Anything else?" hint="A general note, a new idea, a change of plan.">
          <Note token={token} placeholder="Write to us here" cta="Send note" build={(body) => ({ kind: "comment", body })} />
        </Section>
      ) : null}

      {data.messages.length ? (
        <Section title="Your messages">
          <ul className="flex flex-col gap-3">
            {data.messages
              .filter((m) => m.body)
              .slice()
              .reverse()
              .map((m) => (
                <li key={m.id} className="text-[13.5px]">
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">{dateTime(m.createdAt)}</p>
                </li>
              ))}
          </ul>
        </Section>
      ) : null}
    </main>
  );
}

function Delivery({ token, d, locked }: { token: string; d: PortalData["deliveries"][number]; locked: boolean }) {
  const { pending, error, send } = useSend(token);
  const [asking, setAsking] = React.useState(false);
  const src = `/c/${token}/media/${d.id}`;
  const asImage = d.outputType === "image" || d.placeholder;

  return (
    <article>
      <h3 className="text-[14px] font-medium">{d.title}</h3>
      <div className="mt-2 overflow-hidden rounded-lg border bg-muted">
        {asImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={d.title} className="max-h-[70vh] w-full object-contain" />
        ) : d.outputType === "video" ? (
          <video src={src} controls playsInline preload="metadata" className="max-h-[70vh] w-full bg-black" />
        ) : (
          <div className="grid place-items-center gap-3 p-6">
            <AudioLines className="size-8 text-muted-foreground" />
            <audio src={src} controls className="w-full" />
          </div>
        )}
      </div>

      {d.response?.kind === "approve" ? (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-ok-soft px-2.5 py-1.5 text-[13px] font-medium text-ok">
          <Check className="size-3.5" /> You approved this · {dateTime(d.response.at)}
        </p>
      ) : null}
      {d.response?.kind === "change" ? (
        <p className="mt-3 rounded-md bg-info-soft px-2.5 py-1.5 text-[13px] text-info">
          <span className="font-medium">Change requested · {dateTime(d.response.at)}</span>
          {d.response.note ? <span className="mt-0.5 block whitespace-pre-wrap">{d.response.note}</span> : null}
        </p>
      ) : null}

      {!locked && !asking && d.response?.kind !== "approve" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="approve" size="sm" disabled={pending} onClick={() => send({ kind: "approve", ref: d.id })}>
            {pending ? <Loader2 className="animate-spin" /> : <Check />} Approve
          </Button>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setAsking(true)}>
            <MessageSquare /> {d.response?.kind === "change" ? "Add another change" : "Request a change"}
          </Button>
        </div>
      ) : null}
      {asking ? (
        <div className="mt-3">
          <Note token={token} autoFocus placeholder="What should change? Point to a moment, a shot or a word." cta="Send change request" build={(body) => ({ kind: "change", ref: d.id, body })} onDone={() => setAsking(false)} onCancel={() => setAsking(false)} />
        </div>
      ) : null}
      <Err message={error} />
    </article>
  );
}

function Question({ token, q, locked }: { token: string; q: PortalData["questions"][number]; locked: boolean }) {
  const [editing, setEditing] = React.useState(false);
  return (
    <div>
      <p className="text-[14px] font-medium">{q.question}</p>
      {q.answer && !editing ? (
        <p className="mt-1.5 flex items-start gap-2 text-[13.5px]">
          <Check className="mt-0.5 size-3.5 shrink-0 text-ok" />
          <span className="whitespace-pre-wrap">{q.answer}</span>
          {!locked ? (
            <button type="button" onClick={() => setEditing(true)} className="ml-auto shrink-0 text-[12.5px] text-muted-foreground underline-offset-2 hover:underline">
              Edit
            </button>
          ) : null}
        </p>
      ) : !locked ? (
        <div className="mt-2">
          <Note token={token} rows={2} placeholder="Your answer" cta="Save answer" initial={q.answer ?? ""} build={(body) => ({ kind: "answer", ref: q.question, body })} onDone={() => setEditing(false)} />
        </div>
      ) : null}
    </div>
  );
}

function BriefCheck({ token, confirmed }: { token: string; confirmed: boolean }) {
  const { pending, error, send } = useSend(token);
  const [asking, setAsking] = React.useState(false);
  if (asking)
    return (
      <div className="mt-5">
        <Note token={token} autoFocus placeholder="What did we get wrong or miss?" cta="Send correction" build={(body) => ({ kind: "brief_change", body })} onDone={() => setAsking(false)} onCancel={() => setAsking(false)} />
      </div>
    );
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
      {confirmed ? (
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ok">
          <Check className="size-3.5" /> You confirmed this is right
        </span>
      ) : (
        <Button variant="approve" size="sm" disabled={pending} onClick={() => send({ kind: "brief_ok" })}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />} This is right
        </Button>
      )}
      <Button variant="outline" size="sm" disabled={pending} onClick={() => setAsking(true)}>
        Something’s off
      </Button>
      <Err message={error} />
    </div>
  );
}

function Note({
  token,
  placeholder,
  cta,
  build,
  rows = 3,
  initial = "",
  autoFocus,
  onDone,
  onCancel,
}: {
  token: string;
  placeholder: string;
  cta: string;
  build: (body: string) => FeedbackInput;
  rows?: number;
  initial?: string;
  autoFocus?: boolean;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const { pending, error, send } = useSend(token);
  const [text, setText] = React.useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send(build(text), () => {
          setText("");
          onDone?.();
        });
      }}
    >
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={rows} maxLength={2000} placeholder={placeholder} autoFocus={autoFocus} aria-label={placeholder} />
      <div className="mt-2 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending || !text.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />} {cta}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
      <Err message={error} />
    </form>
  );
}
