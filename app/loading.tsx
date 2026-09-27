export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper" aria-live="polite" aria-label="Loading">
      <div className="text-center">
        <span className="mx-auto block size-10 animate-spin rounded-full border-4 border-moss-100 border-t-moss-600" aria-hidden="true" />
        <p className="mt-4 text-sm font-semibold text-muted">Preparing your learning path…</p>
      </div>
    </main>
  );
}
