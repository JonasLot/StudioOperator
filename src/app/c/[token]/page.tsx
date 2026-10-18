import type { Metadata } from "next";
import { loadRuntimeConfig } from "@/lib/runtime-config";
import { loadPortal } from "@/lib/services/client-portal";
import { Portal } from "./portal";

export const dynamic = "force-dynamic";

// A capability URL: keep it out of search engines and never leak it through the Referer header.
export const metadata: Metadata = {
  title: "Project review",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ClientPortalPage(props: PageProps<"/c/[token]">) {
  await loadRuntimeConfig();
  const { token } = await props.params;
  const data = await loadPortal(token);

  if (!data) {
    return (
      <main className="mx-auto grid min-h-screen max-w-md place-items-center px-6 text-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">This link isn’t active</h1>
          <p className="mt-2 text-sm text-muted-foreground">It may have been replaced. Ask your contact for the latest link.</p>
        </div>
      </main>
    );
  }
  return <Portal token={token} data={data} />;
}
