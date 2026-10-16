"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, FlaskConical, LogOut, UserRound, Zap } from "lucide-react";
import { logoutAction } from "@/app/actions";

function crumb(pathname: string) {
  if (pathname === "/") return "Overview";
  if (pathname === "/jobs") return "All jobs";
  if (pathname === "/jobs/new") return "New job";
  if (pathname.startsWith("/jobs/")) return "Job details";
  if (pathname.startsWith("/approvals")) return "Approvals";
  if (pathname.startsWith("/outputs")) return "Outputs";
  if (pathname.startsWith("/models")) return "Model router";
  if (pathname.startsWith("/settings")) return "Autonomy & connections";
  if (pathname.startsWith("/profile")) return "Profile";
  return "";
}

export function Topbar({ mockMode, live, displayName, loginOn }: { mockMode: boolean; live: string; displayName: string; loginOn: boolean }) {
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
        <Link href="/profile" className="inline-flex items-center gap-1.5 hover:text-foreground" title="Your profile">
          <UserRound className="size-3.5" /> <span className="max-w-[10rem] truncate">{displayName}</span>
        </Link>
        {loginOn ? (
          <form action={logoutAction}>
            <button type="submit" className="inline-flex items-center gap-1.5 hover:text-foreground" title="Sign out">
              <LogOut className="size-3.5" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
