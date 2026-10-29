import "server-only";
import { config, draftLive, scrubSecrets } from "@/lib/config";
import { creativeDirectionText, type CreativeBrief } from "./brief";
import { chatRequest, failureReason } from "./draft";
import { extractChatText } from "./chat";
import { mockStepPrompt } from "./mock";

// The first-phase model proposes the prompt for one workflow step from the locked creative brief. It only
// fills the editor; nothing is saved or generated until the operator saves the step.

export interface StepPromptInput {
  stepName: string;
  category: string;
  modelLabel: string;
  purpose: string;
  inputs: string[];
  expectedOutputs: string[];
  prevStep?: { name: string; purpose: string } | null;
}

export interface StepPromptResult {
  prompt: string;
  drafter: string;
  warning: string | null;
}

const SYSTEM_PROMPT = `You write the prompt for one production step of an AI creative studio. You get the creative direction for the whole job and the step (what it must make, its inputs, expected outputs, and previous step it builds on).
Rules:
- Write a single concrete prompt for the named model: subject, composition, light, camera or voice direction, in plain visual language. Keep it under 120 words.
- Follow the creative direction and its avoid list. Use only facts given; never invent product details, text, names or claims. Keep exact text character-for-character.
- If the current prompt already has good specifics, keep them. Maintain visual and stylistic continuity from previous steps.
- Answer with the prompt text only: no preface, no quotes, no markdown.`;

const clean = (t: string) => t.trim().replace(/^```\w*\s*/, "").replace(/\s*```$/, "").replace(/^["“]([\s\S]*)["”]$/, "$1").trim().slice(0, 2000);

export async function suggestStepPrompt(step: StepPromptInput, brief: CreativeBrief): Promise<StepPromptResult> {
  if (!draftLive()) return { prompt: mockStepPrompt(step.purpose, brief, step.prevStep), drafter: "mock-draft", warning: null };
  try {
    const res = await chatRequest({
      model: config.draft.model,
      temperature: 0.5,
      stream: false,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify({ creativeDirection: creativeDirectionText(brief), step }) },
      ],
    });
    if (!res.ok) throw new Error(await failureReason(res));
    const prompt = clean(extractChatText(await res.json()));
    if (!prompt) throw new Error("the answer was empty");
    return { prompt, drafter: config.draft.model, warning: null };
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : scrubSecrets((err as Error).message);
    return { prompt: mockStepPrompt(step.purpose, brief, step.prevStep), drafter: "mock-draft (fallback)", warning: `${config.draft.model} could not suggest a prompt, used the offline one: ${reason}` };
  }
}
