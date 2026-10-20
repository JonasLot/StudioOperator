import "server-only";
import { getModel } from "@/lib/higgsfield/catalog";
import { cleanTakePrompt, validatePrompt, type PromptInput } from "@/lib/prompts/library";
import { getRepo } from "@/lib/repo";
import type { SavedPrompt } from "@/lib/domain/types";
import { GuardrailError } from "./guardrails";
import { newId } from "./ids";

const now = () => new Date().toISOString();

function valid(input: Parameters<typeof validatePrompt>[0]): PromptInput {
  const r = validatePrompt(input);
  if (!r.ok) throw new GuardrailError(Object.values(r.errors)[0] ?? "Check the prompt.");
  if (r.value.modelId) {
    try {
      getModel(r.value.modelId);
    } catch {
      throw new GuardrailError("That model is not in the catalog.");
    }
  }
  return r.value;
}

export const listPrompts = () => getRepo().listPrompts();

export async function savePrompt(input: Parameters<typeof validatePrompt>[0], sourceJobId: string | null = null): Promise<SavedPrompt> {
  const v = valid(input);
  const t = now();
  const p: SavedPrompt = { id: newId("pr"), ...v, uses: 0, sourceJobId, createdAt: t, updatedAt: t };
  await getRepo().insertPrompt(p);
  return p;
}

export async function updatePrompt(id: string, input: Parameters<typeof validatePrompt>[0]) {
  if (!(await getRepo().getPrompt(id))) throw new GuardrailError("That prompt no longer exists.");
  await getRepo().updatePrompt(id, valid(input));
}

export async function deletePrompt(id: string) {
  await getRepo().deletePrompt(id);
}

export async function markPromptUsed(id: string) {
  await getRepo().bumpPromptUses(id);
}

/** Save the prompt that produced a take, as it was sent (minus the take number). */
export async function savePromptFromTake(jobId: string, generationId: string, name: string, notes: string | null) {
  const repo = getRepo();
  const g = await repo.getGeneration(generationId);
  if (!g || g.jobId !== jobId) throw new GuardrailError("Take not found.");
  const step = (await repo.getCurrentWorkflow(jobId))?.steps.find((s) => s.id === g.stepId);
  const modelId = step?.modelId ?? g.model;
  return savePrompt({ name, category: step?.category ?? getModel(modelId).category, modelId, tags: [], body: cleanTakePrompt(g.prompt), notes }, jobId);
}
