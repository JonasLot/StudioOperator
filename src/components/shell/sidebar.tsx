"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, ChevronRight, FolderOpen, Layers, LayoutGrid, Settings2, ShieldCheck, Split, Images, UserRound } from "lucide-react";
import { initials } from "@/lib/settings/rules";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid, match: (p: string) => p === "/" },
  { href: "/jobs", label: "All jobs", icon: FolderOpen, match: (p: string) => p === "/jobs" || (p.startsWith("/jobs/") && p !== "/jobs/new") },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck, match: (p: string) => p.startsWith("/approvals"), badge: "approvals" as const },
  { href: "/outputs", label: "Outputs", icon: Images, match: (p: string) => p.startsWith("/outputs") },
  { href: "/models", label: "Model router", icon: Split, match: (p: string) => p.startsWith("/models") },
  { href: "/autonomy", label: "Autonomy", icon: Bot, match: (p: string) => p.startsWith("/autonomy") },
  { href: "/settings", label: "Connections", icon: Settings2, match: (p: string) => p.startsWith("/settings") },
  { href: "/profile", label: "Profile", icon: UserRound, match: (p: string) => p.startsWith("/profile") },
];

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-start gap-2.5">
      <Layers className="mt-1 size-5 shrink-0 text-brand" strokeWidth={1.75} />
      <span className="flex flex-col">
        <span className="text-[19px] leading-tight tracking-[-0.03em]">
          <span className="font-semibold">studio</span>
          <span className="font-normal">operator</span>
        </span>
        {!compact ? <span className="mt-0.5 text-[8.5px] font-medium uppercase leading-snug tracking-[0.2em] text-muted-foreground">Your creative<br />operating system</span> : null}
      </span>
    </Link>
  );
}

export function SidebarNav({ approvals, orientation = "vertical" }: { approvals: number; orientation?: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  if (orientation === "horizontal") {
    return (
      <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2" aria-label="Workspace">
        {NAV.map((n) => {
          const active = n.match(pathname);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn("flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px]", active ? "bg-brand-soft text-brand" : "text-muted-foreground")}
            >
              <n.icon className="size-3.5" />
              {n.label}
              {n.badge && approvals ? <span className="tnum rounded bg-card px-1 text-[10px]">{approvals}</span> : null}
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Workspace">
      {NAV.map((n) => {
        const active = n.match(pathname);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] transition-colors",
              active ? "bg-brand-soft font-medium text-brand" : "text-foreground/75 hover:bg-accent hover:text-foreground",
            )}
          >
            <n.icon className={cn("size-[18px]", active ? "text-brand" : "text-muted-foreground")} strokeWidth={1.75} />
            <span className="flex-1">{n.label}</span>
            {n.badge && approvals ? (
              <span className="tnum rounded-md border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{approvals}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function WorkspaceCard({ studioName, displayName }: { studioName: string; displayName: string }) {
  return (
    <Link href="/profile" className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-[0_1px_2px_rgb(0_0_0/0.03)] transition-colors hover:bg-accent/50">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-[13px] font-semibold">{initials(studioName)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-tight">{studioName}</span>
        <span className="block truncate text-[11.5px] text-muted-foreground">{displayName}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </Link>
  );
}
