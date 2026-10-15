import type { JobStatus } from "@/lib/domain/types";

// Visual identity per pipeline stage. Client-safe (no server imports).
export const STATUS_META: Record<JobStatus, { label: string; bar: string; pill: string; hint: string }> = {
  new: { label: "New", bar: "bg-muted-foreground/35", pill: "bg-muted text-muted-foreground", hint: "Pasted, not analysed" },
  needs_review: { label: "Needs Review", bar: "bg-warn/70", pill: "bg-warn-soft text-warn", hint: "Waiting on your approval" },
  approved: { label: "Approved", bar: "bg-ok/70", pill: "bg-ok-soft text-ok", hint: "Cleared to produce" },
  generating: { label: "Generating", bar: "bg-info/70", pill: "bg-info-soft text-info", hint: "Agent working inside the cap" },
  qa: { label: "QA", bar: "bg-lilac/60", pill: "bg-lilac/10 text-lilac", hint: "Your review & revisions" },
  delivered: { label: "Delivered", bar: "bg-steel/60", pill: "bg-steel/10 text-steel", hint: "Closed" },
  rejected: { label: "Rejected", bar: "bg-bad/45", pill: "bg-bad-soft text-bad", hint: "Declined" },
};
