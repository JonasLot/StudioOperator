import { getRepo } from "@/lib/repo";
import { getModel } from "@/lib/higgsfield/catalog";

// Serves a deterministic placeholder for mock-mode outputs. Never used in live mode.

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function GET(_req: Request, ctx: RouteContext<"/api/mock-output/[id]">) {
  const { id } = await ctx.params;
  const gen = getRepo().getGeneration(id);
  if (!gen) return new Response("Not found", { status: 404 });
  const model = getModel(gen.model);
  const h = hash(gen.id);
  const hue = (h % 360) as number;
  const hue2 = (hue + 40 + (h % 80)) % 360;
  const wide = model.output !== "image" || h % 3 !== 0;
  const [w, hgt] = wide ? [640, 360] : [480, 600];
  const horizon = 0.45 + ((h >>> 8) % 20) / 100;
  const label = `${model.label} · take ${gen.attempt}`;

  let body = "";
  if (model.output === "audio") {
    const bars = Array.from({ length: 64 }, (_, i) => {
      const v = Math.abs(Math.sin((i + (h % 13)) * 0.45) * Math.cos(i * 0.13)) * 120 + 8;
      return `<rect x="${40 + i * 9}" y="${hgt / 2 - v / 2}" width="5" height="${v}" rx="2" fill="hsl(${hue} 60% 70%)" opacity="0.9"/>`;
    }).join("");
    body = `<rect width="100%" height="100%" fill="hsl(${hue} 25% 12%)"/>${bars}`;
  } else {
    const stars = Array.from({ length: 30 }, (_, i) => {
      const x = ((h >>> (i % 16)) * (i + 7)) % w;
      const y = ((h >>> ((i + 3) % 16)) * (i + 11)) % (hgt * horizon);
      return `<circle cx="${x}" cy="${y}" r="${(i % 3) * 0.5 + 0.6}" fill="white" opacity="${0.3 + (i % 5) / 10}"/>`;
    }).join("");
    body = `
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="hsl(${hue} 45% 14%)"/>
          <stop offset="${horizon}" stop-color="hsl(${hue2} 55% 42%)"/>
          <stop offset="1" stop-color="hsl(${hue} 30% 8%)"/>
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="${horizon}" r="0.6">
          <stop offset="0" stop-color="hsl(${(hue2 + 30) % 360} 80% 70%)" stop-opacity="0.55"/>
          <stop offset="1" stop-color="transparent"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#sky)"/>
      <rect width="100%" height="100%" fill="url(#glow)"/>
      ${stars}
      <path d="M0 ${hgt * (horizon + 0.12)} L${w * 0.25} ${hgt * (horizon - 0.04)} L${w * 0.45} ${hgt * (horizon + 0.08)} L${w * 0.7} ${hgt * (horizon - 0.08)} L${w} ${hgt * (horizon + 0.1)} L${w} ${hgt} L0 ${hgt}Z" fill="hsl(${hue} 30% 6%)" opacity="0.85"/>
      ${model.output === "video" ? `<circle cx="${w / 2}" cy="${hgt / 2}" r="26" fill="black" opacity="0.45"/><path d="M${w / 2 - 8} ${hgt / 2 - 13} L${w / 2 + 14} ${hgt / 2} L${w / 2 - 8} ${hgt / 2 + 13}Z" fill="white"/>` : ""}`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}" font-family="ui-monospace, Menlo, monospace">
  ${body}
  <rect x="0" y="${hgt - 30}" width="${w}" height="30" fill="black" opacity="0.55"/>
  <text x="12" y="${hgt - 11}" font-size="12" fill="white" opacity="0.9">${esc(label)}</text>
  <text x="${w - 12}" y="${hgt - 11}" font-size="11" fill="white" opacity="0.6" text-anchor="end">MOCK · ${model.output.toUpperCase()}</text>
</svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=31536000, immutable" } });
}
