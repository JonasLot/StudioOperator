// Shown inside the shell while a page's data loads, so a menu click answers at once
// instead of leaving the old page on screen until the server has finished.
export default function Loading() {
  return (
    <div className="flex flex-col gap-8" role="status" aria-label="Loading">
      <div className="flex flex-col gap-3">
        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
        <div className="h-9 w-2/3 max-w-[460px] animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 max-w-[360px] animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border bg-card">
            <div className="border-b px-6 py-4">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            </div>
            <div className="flex flex-col gap-3 px-6 py-5">
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
