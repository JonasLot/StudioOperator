import { redirect } from "next/navigation";
import { authEnabled, currentSession } from "@/lib/auth";
import { safeNextPath } from "@/lib/auth/session";
import { Layers } from "lucide-react";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in · &more Design" };

export default async function LoginPage(props: PageProps<"/login">) {
  // Nothing to sign in with, or already signed in: go straight to the app.
  if (!authEnabled() || (await currentSession())) redirect("/");
  const sp = await props.searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null);
  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex items-center gap-2.5">
          <Layers className="size-6 text-brand" strokeWidth={1.75} />
          <span className="text-[22px] tracking-[-0.03em]">
            <span className="font-semibold">&amp;more</span>
            <span className="font-normal">design</span>
          </span>
        </div>
        <section className="rounded-xl border bg-card p-6 shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
          <h1 className="text-[18px] font-semibold">Sign in</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Enter the studio passcode to continue.</p>
          <LoginForm next={next} />
        </section>
      </div>
    </main>
  );
}
