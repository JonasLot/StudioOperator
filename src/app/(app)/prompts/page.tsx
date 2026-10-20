import { PageHeader } from "@/components/page-header";
import { MODEL_CATALOG } from "@/lib/higgsfield/catalog";
import { listPrompts } from "@/lib/services/prompts";
import { loadRuntimeConfig } from "@/lib/runtime-config";
import { PromptLibrary } from "./prompt-library";

export const dynamic = "force-dynamic";

export default async function PromptsPage() {
  await loadRuntimeConfig();
  const prompts = await listPrompts();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Workspace / Prompt library"
        title="Prompts that already work."
        subtitle="Save the prompts that gave approved takes, then drop them into any step. Use {{variables}} such as {{logline}}, {{tone}} or {{visual_direction}} and they are filled from the job’s creative brief when you insert the prompt."
      />
      <PromptLibrary prompts={prompts} models={MODEL_CATALOG.map((m) => ({ id: m.id, label: m.label, category: m.category }))} />
    </div>
  );
}
