"use client"
const FullScreenLoader = () => {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--background)] transition-colors duration-300">
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-12 w-12">
          <div className="absolute h-full w-full animate-spin rounded-full border-4 border-solid border-[var(--border)] border-t-[var(--primary)]" />
        </div>
        <p className="text-sm font-medium text-[var(--foreground)]/80">
          Loading...
        </p>
      </div>
    </div>
  );
};

export default FullScreenLoader;
