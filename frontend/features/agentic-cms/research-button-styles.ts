const base = 'inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm transition-colors enabled:cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none';

export const researchButton = `${base} border-[var(--primary)] bg-[var(--accent)] text-[var(--primary)] enabled:hover:bg-[var(--secondary)]`;
export const researchPrimaryButton = `${base} border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)] enabled:hover:brightness-110`;
