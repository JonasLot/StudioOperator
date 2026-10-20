// Pure rules for settings edited in the UI: the mock-mode override and the operator profile.

export type MockSetting = "mock" | "live";

export function parseMockSetting(value: string | null | undefined): MockSetting | null {
  return value === "mock" || value === "live" ? value : null;
}

/** Is the app in mock mode? An explicit UI choice wins; otherwise STUDIO_MOCK_MODE (mock unless it is "false"). */
export function resolveMockMode(setting: MockSetting | null, env: string | undefined): boolean {
  if (setting === "mock") return true;
  if (setting === "live") return false;
  return env !== "false";
}

/** Is mock mode explicitly forced? Used by brief analysis, which is live whenever a key exists unless forced to mock. */
export function resolveMockForced(setting: MockSetting | null, env: string | undefined): boolean {
  if (setting === "mock") return true;
  if (setting === "live") return false;
  return env === "true";
}

export interface Profile {
  displayName: string;
  studioName: string;
  email: string;
}

export type ProfileResult = { ok: true; value: Profile } | { ok: false; errors: Partial<Record<keyof Profile, string>> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateProfile(input: { displayName?: unknown; studioName?: unknown; email?: unknown }): ProfileResult {
  const text = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
  const value: Profile = { displayName: text(input.displayName), studioName: text(input.studioName), email: text(input.email) };
  const errors: Partial<Record<keyof Profile, string>> = {};
  if (!value.displayName) errors.displayName = "Add the name approvals should be recorded under.";
  else if (value.displayName.length > 60) errors.displayName = "Keep it under 60 characters.";
  if (!value.studioName) errors.studioName = "Give the studio a name.";
  else if (value.studioName.length > 60) errors.studioName = "Keep it under 60 characters.";
  if (value.email && (value.email.length > 120 || !EMAIL.test(value.email))) errors.email = "That doesn't look like an email address.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/** Up to two capital letters for an avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 1) : parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1);
  return letters.toUpperCase();
}

// --- first-phase AI (drafts the creative brief) ---

export interface DraftModel {
  baseUrl: string;
  model: string;
}

export type DraftModelResult = { ok: true; value: DraftModel } | { ok: false; errors: Partial<Record<keyof DraftModel, string>> };

/** An OpenAI-compatible endpoint (Ollama, LM Studio, OpenRouter, OpenAI) and the model to ask. */
export function validateDraftModel(input: { baseUrl?: unknown; model?: unknown }): DraftModelResult {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const baseUrl = text(input.baseUrl).replace(/\/+$/, "");
  const model = text(input.model);
  const errors: Partial<Record<keyof DraftModel, string>> = {};
  let url: URL | null = null;
  try {
    url = new URL(baseUrl);
  } catch {
    /* reported below */
  }
  if (!url || !/^https?:$/.test(url.protocol) || url.username || url.password) errors.baseUrl = "Use a full http(s) address, e.g. http://localhost:11434/v1 (no username or password in it).";
  if (!model) errors.model = "Name the model, e.g. llama3.2.";
  else if (model.length > 100) errors.model = "Keep the model name under 100 characters.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { baseUrl, model } };
}

export function parseDraftModel(raw: string | null | undefined): DraftModel | null {
  if (!raw) return null;
  try {
    const r = validateDraftModel(JSON.parse(raw) as Record<string, unknown>);
    return r.ok ? r.value : null;
  } catch {
    return null;
  }
}
