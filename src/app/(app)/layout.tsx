import { ShieldCheck, TriangleAlert } from "lucide-react";
import { Logo, SidebarNav, WorkspaceCard } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { publicConfig } from "@/lib/config";
import { getRepo } from "@/lib/repo";
import { authEnabled } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { getProfile } from "@/lib/settings";
import { loadRuntimeConfig } from "@/lib/runtime-config";
// Every screen reads the live database and the layout seeds it on first use, so
// nothing is statically prerendered — this also keeps `next build` from opening a
// database connection (e.g. the not-found page) before env vars point anywhere real.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await loadRuntimeConfig();
  await ensureSeeded();
  const cfg = publicConfig();
  const approvals = await getRepo().countPendingApprovals();
  const profile = getProfile();
  const loginOn = authEnabled();
  const live = `Live · Astra ${cfg.astraLive ? "on" : "off"} · Higgsfield ${cfg.higgsfieldLive ? "on" : "off"}`;

  return (
    <>
      {!loginOn ? (
        <div role="status" className="flex items-center justify-center gap-2 border-b bg-warn-soft print:hidden px-4 py-2 text-center text-[12.5px]">
          <TriangleAlert className="size-3.5 shrink-0 text-warn" />
          Login is off, so anyone with the link can use this app. Set <code className="rounded bg-card px-1">ADMIN_PASSCODE</code> (12+ characters) on the server and redeploy to turn it on.
        </div>
      ) : null}
      <div className="flex min-h-screen">
          <aside className="sticky top-0 hidden print:hidden h-screen w-[248px] shrink-0 flex-col border-r bg-sidebar px-3 py-6 lg:flex">
            <div className="px-3">
              <Logo />
            </div>
            <div className="mt-7">
              <WorkspaceCard studioName={profile.studioName} displayName={profile.displayName} />
            </div>
            <div className="eyebrow mt-8 mb-2 px-3 text-[10.5px]">Workspace</div>
            <SidebarNav approvals={approvals} />
            <div className="mt-auto px-3">
              <ShieldCheck className="size-5 text-muted-foreground" strokeWidth={1.5} />
              <p className="mt-2 text-[12.5px] font-medium">You’re in control.</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                Approval before production.
                <br />A hard ceiling on spend.
                <br />Nothing leaves without you.
              </p>
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-b bg-sidebar px-4 pt-4 lg:hidden print:hidden">
              <div className="mb-3 flex items-center justify-between">
                <Logo compact />
              </div>
              <SidebarNav approvals={approvals} orientation="horizontal" />
            </div>
            <div className="print:hidden"><Topbar mockMode={cfg.mockMode} live={live} displayName={profile.displayName} loginOn={loginOn} /></div>
            <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-8 sm:px-6 lg:px-12 lg:py-12 print:max-w-none print:p-0">{children}</main>
          </div>
      </div>
    </>
  );
}
