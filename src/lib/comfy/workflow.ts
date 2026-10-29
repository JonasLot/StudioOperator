// ---------------------------------------------------------------------------
// ComfyUI workflow templates. A template is a workflow exported with "Save (API Format)" in which
// string values of the form "{{name}}" are placeholders. Pure module (no server-only, no "@/..."
// imports) so it can be unit-tested directly.
//
//   {{prompt}}  the step prompt          {{seed}}    random integer
//   {{width}} {{height}}  pixels, from the deliverable's aspect ratio
//   {{duration}}  seconds                {{frames}}  duration x fps
//   {{fps}}  frames per second
//
// A value that is exactly one placeholder keeps its type (a number stays a number); a placeholder
// inside a longer string is substituted as text.
// ---------------------------------------------------------------------------

export type WorkflowValues = Record<string, string | number>;

export function fillTemplate<T>(node: T, values: WorkflowValues): T {
  if (typeof node === "string") {
    const whole = node.match(/^\{\{(\w+)\}\}$/);
    if (whole && whole[1] in values) return values[whole[1]] as T;
    return node.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in values ? String(values[k]) : m)) as T;
  }
  if (Array.isArray(node)) return node.map((x) => fillTemplate(x, values)) as T;
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, fillTemplate(v, values)])) as T;
  }
  return node;
}

/** Placeholders left unfilled, so a typo in a template is reported instead of sent to ComfyUI. */
export function unfilledPlaceholders(node: unknown): string[] {
  const found = new Set<string>();
  const walk = (n: unknown) => {
    if (typeof n === "string") for (const m of n.matchAll(/\{\{(\w+)\}\}/g)) found.add(m[1]);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object") Object.values(n).forEach(walk);
  };
  walk(node);
  return [...found];
}

/** Pixel size for an aspect ratio such as "9:16", with the long side at `longSide`, both rounded to a multiple of 8. */
export function sizeForRatio(ratio: string | null | undefined, longSide: number): { width: number; height: number } {
  const m = ratio?.match(/^(\d{1,2}):(\d{1,2})$/);
  const w = m ? Number(m[1]) : 1;
  const h = m ? Number(m[2]) : 1;
  const snap = (n: number) => Math.max(64, Math.round(n / 8) * 8);
  return w >= h ? { width: snap(longSide), height: snap((longSide * h) / w) } : { width: snap((longSide * w) / h), height: snap(longSide) };
}

export interface ComfyFile {
  filename: string;
  subfolder?: string;
  type?: string;
}

/** Pick the finished file from a /history entry's outputs, preferring saved outputs over temp previews. */
export function pickOutput(outputs: Record<string, Record<string, unknown>> | undefined, kind: "image" | "video"): ComfyFile | null {
  const keys = kind === "video" ? ["videos", "gifs", "images"] : ["images"];
  const files: ComfyFile[] = [];
  for (const node of Object.values(outputs ?? {})) {
    for (const k of keys) {
      const list = node?.[k];
      if (Array.isArray(list)) for (const f of list) if (f && typeof (f as ComfyFile).filename === "string") files.push(f as ComfyFile);
    }
  }
  const saved = files.filter((f) => (f.type ?? "output") === "output");
  return (saved[0] ?? files[0]) ?? null;
}
