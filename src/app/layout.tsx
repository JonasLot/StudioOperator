import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { Logo, SidebarNav, WorkspaceCard } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { publicConfig } from "@/lib/config";
import { getRepo } from "@/lib/repo";
import { ensureSeeded } from "@/lib/seed";
import "./globals.css";

export const metadata: Metadata = {
  title: "Studio Operator",
  description: "Your creative operating system",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await ensureSeeded();
  const cfg = publicConfig();
  const approvals = getRepo()
    .listApprovals()
    .filter((a) => a.status === "pending").length;
  const live = `Live · Astra ${cfg.astraLive ? "on" : "off"} · Higgsfield ${cfg.higgsfieldLive ? "on" : "off"}`;

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <div className="flex min-h-screen">
          <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r bg-sidebar px-3 py-6 lg:flex">
            <div className="px-3">
              <Logo />
            </div>
            <div className="mt-7">
              <WorkspaceCard />
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
            <div className="border-b bg-sidebar px-4 pt-4 lg:hidden">
              <div className="mb-3 flex items-center justify-between">
                <Logo compact />
              </div>
              <SidebarNav approvals={approvals} orientation="horizontal" />
            </div>
            <Topbar mockMode={cfg.mockMode} live={live} />
            <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-8 sm:px-6 lg:px-12 lg:py-12">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
