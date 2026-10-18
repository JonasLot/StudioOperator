"use server";

import { revalidatePath } from "next/cache";
import { loadRuntimeConfig } from "@/lib/runtime-config";
import { submitClientFeedback, type FeedbackInput } from "@/lib/services/client-portal";
import { GuardrailError } from "@/lib/services/guardrails";

// Deliberately no sign-in check: the unguessable token in the URL is the credential here.
// Every input is validated again in the service, which only ever acts on the token's own job.
export async function clientFeedbackAction(token: string, input: FeedbackInput): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await loadRuntimeConfig();
    await submitClientFeedback(token, input);
    revalidatePath(`/c/${token}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof GuardrailError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
