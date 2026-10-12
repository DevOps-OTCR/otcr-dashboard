export function PageLoading() {
  return (
    <div role="status" className="flex items-center justify-center gap-3 p-12 text-sm text-[var(--foreground)]/65">
      <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
      Loading page...
    </div>
  );
}
