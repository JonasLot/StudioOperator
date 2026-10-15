"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, FlaskConical, Lock, Zap } from "lucide-react";

function crumb(pathname: string) {
  if (pathname === "/") return "Overview";
  if (pathname === "/jobs") return "All jobs";
  if (pathname === "/jobs/new") return "New job";
  if (pathname.startsWith("/jobs/")) return "Job details";
  if (pathname.startsWith("/approvals")) return "Approvals";
  if (pathname.startsWith("/outputs")) return "Outputs";
  if (pathname.startsWith("/models")) return "Model router";
  if (pathname.startsWith("/settings")) return "Autonomy & connections";
  return "";
}

export function Topbar({ mockMode, live }: { mockMode: boolean; live: string }) {
  const pathname = usePathname();
  return (
    <div className="flex h-14 items-center justify-between gap-3 border-b bg-card/60 px-6 backdrop-blur lg:px-10">
      <div className="flex items-center gap-2 text-[13px]">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          Workspace
        </Link>
        <ChevronRight className="size-3.5 text-muted-foreground/70" />
        <span className="font-medium">{crumb(pathname)}</span>
      </div>
      <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
        <Link href="/settings" className="hidden items-center gap-1.5 hover:text-foreground sm:inline-flex" title={mockMode ? "No API calls are made" : live}>
          {mockMode ? <FlaskConical className="size-3.5" /> : <Zap className="size-3.5 text-ok" />}
          {mockMode ? "Mock mode" : live}
        </Link>
        <span className="hidden items-center gap-1.5 md:inline-flex">
          <Lock className="size-3.5" /> Private studio workspace
        </span>
      </div>
    </div>
  );
}
