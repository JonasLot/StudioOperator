import { GET as mockOutput } from "@/app/api/mock-output/[id]/route";
import { getRepo } from "@/lib/repo";
import { loadRuntimeConfig } from "@/lib/runtime-config";
import { portalTake } from "@/lib/services/client-portal";

// Serves one approved take to the holder of a client link. The operator app's own /api/asset
// route sits behind the sign-in, so the portal gets this token-scoped door instead.
const PRIVATE = { "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

export async function GET(req: Request, ctx: RouteContext<"/c/[token]/media/[id]">) {
  await loadRuntimeConfig();
  const { token, id } = await ctx.params;
  const take = await portalTake(token, id);
  if (!take?.outputUrl) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const url = take.outputUrl;

  const asset = url.match(/^\/api\/asset\/([\w-]+)$/);
  if (asset) {
    const stored = await getRepo().getAsset(asset[1]);
    if (!stored || stored.jobId !== take.jobId) return new Response("Not found", { status: 404 });
    return bytes(req, Buffer.from(stored.data, "base64"), stored.mime);
  }

  if (url.startsWith("/api/mock-output/")) {
    const res = await mockOutput(req, { params: Promise.resolve({ id: take.id }) } as RouteContext<"/api/mock-output/[id]">);
    return new Response(res.body, { status: res.status, headers: { "Content-Type": res.headers.get("Content-Type") ?? "image/svg+xml", ...PRIVATE } });
  }

  // A provider URL that was never copied into our storage: send the browser to it.
  if (/^https:\/\//i.test(url)) return Response.redirect(url, 302);
  return new Response("Not found", { status: 404 });
}

/** Whole body, or a single byte range — Safari will not play video without range support. */
function bytes(req: Request, buf: Buffer, mime: string) {
  const headers = { "Content-Type": mime, "Accept-Ranges": "bytes", ...PRIVATE };
  const m = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === "" && m[2] === "")) return new Response(new Uint8Array(buf), { headers: { ...headers, "Content-Length": String(buf.length) } });
  const start = m[1] === "" ? Math.max(0, buf.length - Number(m[2])) : Number(m[1]);
  const end = m[1] === "" || m[2] === "" ? buf.length - 1 : Math.min(Number(m[2]), buf.length - 1);
  if (start > end || start >= buf.length) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${buf.length}` } });
  return new Response(new Uint8Array(buf.subarray(start, end + 1)), {
    status: 206,
    headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${buf.length}`, "Content-Length": String(end - start + 1) },
  });
}
