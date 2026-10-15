import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { publicConfig } from "@/lib/config";
import { PageHeader } from "@/components/page-header";
import { NewJobForm } from "./new-job-form";

export const dynamic = "force-dynamic";

export default function NewJobPage() {
  const cfg = publicConfig();
  const d = new Date();
  d.setDate(d.getDate() + 10);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <Link href="/jobs" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> All jobs
      </Link>
      <PageHeader
        eyebrow="Workspace / New job"
        title="Paste a new brief."
        subtitle={`Paste it exactly as the client wrote it. ${cfg.astraLive ? `${cfg.astraModel} structures it` : "The offline analyzer structures it (mock mode)"}, then a plan and cost estimate wait for your approval. Nothing is sent anywhere.`}
      />
      <NewJobForm feeDefaults={cfg.sourceFeePct} defaultDeadline={d.toISOString().slice(0, 10)} />
    </div>
  );
}
