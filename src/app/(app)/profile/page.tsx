import type { ReactNode } from "react";
import { KeyRound, LogOut, ShieldCheck, TriangleAlert } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { authEnabled, currentSession } from "@/lib/auth";
import { storageIsDurable } from "@/lib/secrets";
import { getProfile } from "@/lib/settings";
import { initials } from "@/lib/settings/rules";
import { ProfileForm } from "./profile-form";
import { loadRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
      <h2 className="border-b px-6 py-4 text-[15px] font-semibold">{title}</h2>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

const when = (seconds: number) => new Date(seconds * 1000).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default async function ProfilePage() {
  await loadRuntimeConfig();
  const profile = getProfile();
  const loginOn = authEnabled();
  const session = await currentSession();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Workspace / Profile"
        title="Who is running the studio."
        subtitle="Your name is what every approval, rights clearance and audit entry is recorded under."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Your profile">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-xl bg-muted text-[16px] font-semibold">{initials(profile.displayName)}</span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium">{profile.displayName}</p>
              <p className="truncate text-[13px] text-muted-foreground">{profile.studioName}</p>
            </div>
          </div>
          {!storageIsDurable() ? (
            <p className="mb-4 flex items-start gap-2 rounded-lg border bg-warn-soft px-3 py-2 text-[12.5px]">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
              <span>No durable database is configured (set DATABASE_URL to a Postgres database), so the profile lives in temporary storage and can reset on a redeploy.</span>
            </p>
          ) : null}
          <ProfileForm defaults={{ displayName: profile.displayName, studioName: profile.studioName, email: profile.email }} />
        </Card>
        <div className="flex flex-col gap-6">
          <Card title="Session">
            {loginOn ? (
              <div className="flex flex-col gap-4">
                {session ? (
                  <dl className="grid grid-cols-2 gap-4 text-[13px]">
                    <div>
                      <dt className="text-muted-foreground">Signed in</dt>
                      <dd className="mt-1 font-medium">{when(session.iat)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Session ends</dt>
                      <dd className="mt-1 font-medium">{when(session.exp)}</dd>
                    </div>
                  </dl>
                ) : null}
                <form action={logoutAction}>
                  <Button variant="outline" type="submit">
                    <LogOut /> Sign out
                  </Button>
                </form>
              </div>
            ) : (
              <p className="flex items-start gap-2 text-[13.5px]">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
                <span>
                  Login is off, so anyone with the link can use this app. Set <code className="rounded bg-muted px-1">ADMIN_PASSCODE</code> (12+ characters) on the server and redeploy to require a sign-in.
                </span>
              </p>
            )}
          </Card>
          <Card title="Security">
            <ul className="flex flex-col gap-3 text-[13.5px]">
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>Everything in the app, including every action behind a button, requires a signed-in session when login is on. Sessions last seven days.</span>
              </li>
              <li className="flex items-start gap-2">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>
                  The passcode is the <code className="rounded bg-muted px-1">ADMIN_PASSCODE</code> environment variable. Changing it signs everyone out, and API keys saved on the Settings page then have to be entered again.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>After eight wrong passcodes from one address, sign-in is paused for fifteen minutes.</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
