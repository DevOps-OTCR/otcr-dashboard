'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthContext';
import { AutosaveStore, type FieldOptions, type SaveValue } from '@/lib/autosave';

const Context = createContext<AutosaveStore | null>(null);
export function useAutosave() {
  const store = useContext(Context);
  if (!store) throw new Error('AutosaveProvider is required');
  return store;
}
export function AutosaveProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <AccountAutosave key={user?.email ?? 'signed-out'}>{children}</AccountAutosave>;
}
function AccountAutosave({ children }: { children: ReactNode }) {
  const [store] = useState(() => new AutosaveStore());
  const router = useRouter();
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  useEffect(() => {
    let mounted = true;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (store.pending().length) { event.preventDefault(); event.returnValue = ''; }
    };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element)?.closest?.('a');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || !store.pending().length) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void store.flushAll().then(saved => { if (saved && mounted) router.push(`${url.pathname}${url.search}${url.hash}`); });
    };
    // Back/forward can unmount a page without a link click. Drafts survive in this
    // root provider, flush on editor detach, and stay visible here on failure.
    const popstate = () => { void store.flushAll(); };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('popstate', popstate);
    document.addEventListener('click', click, true);
    return () => {
      mounted = false;
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('popstate', popstate);
      document.removeEventListener('click', click, true);
    };
  }, [store, router]);
  useEffect(() => {
    // StrictMode runs effect cleanup/setup twice. Dispose only after a real
    // provider removal, and never carry an account's drafts into another login.
    const lifetime = { active: true };
    accountLifetimes.set(store, lifetime);
    return () => {
      lifetime.active = false;
      queueMicrotask(() => { if (!accountLifetimes.get(store)?.active) store.dispose(); });
    };
  }, [store]);
  const pending = store.pending();
  const attention = pending.filter(e => e.status === 'error' || e.status === 'invalid' || !e.mounts);
  return <Context.Provider value={store}>
    {children}
    {attention.length > 0 && <div role="alert" className="fixed bottom-4 left-4 right-4 z-[100] rounded-xl border border-amber-500 bg-[var(--card)] p-4 shadow-lg text-sm">
      <p className="font-medium">Some edits haven’t saved. Keep this tab open.</p>
      {attention.map(e => <div key={e.id} className="mt-2 flex flex-wrap items-center gap-3">
        <span>{e.label}: {e.error ?? 'Saving…'}</span>
        {e.status === 'error' && <button type="button" className="underline" onClick={() => void store.flush(e.id)}>Retry</button>}
        {!e.mounts && <button type="button" className="underline" onClick={() => router.push(e.href)}>Return to editor</button>}
      </div>)}
    </div>}
  </Context.Provider>;
}
const accountLifetimes = new WeakMap<AutosaveStore, { active: boolean }>();

type Controls<T> = { value: T; change: (value: T, inputError?: string) => void; blur: () => void };
export function AutosaveField<T extends SaveValue>({ children, ...options }: FieldOptions<T> & { children: (controls: Controls<T>) => ReactNode }) {
  const store = useAutosave();
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  useEffect(() => { store.sync(options); });
  useEffect(() => store.mount(options.id), [store, options.id]);
  const field = store.get(options.id);
  const state = field?.status ?? 'idle';
  const value = (field?.value ?? options.value) as T;
  return <div data-autosave={options.id} className="min-w-0">
    {children({ value, change: (next, error) => store.edit(options.id, next, error), blur: () => { void store.flush(options.id); } })}
    <div role="status" aria-live="polite" className="mt-1 min-h-4 text-xs text-[var(--foreground)]/65">
      {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'dirty' ? 'Unsaved changes' : state === 'invalid' ? field?.error : null}
      {state === 'error' && <>Couldn’t save — <button type="button" className="underline" onClick={() => void store.flush(options.id)}>Retry</button></>}
    </div>
  </div>;
}

export function AutosaveInput({ type = 'text', className = '', ...options }: FieldOptions<string> & { type?: string; className?: string }) {
  return <AutosaveField {...options}>{({ value, change, blur }) => <input
    type={type} aria-label={options.label} value={value}
    onChange={event => change(event.target.value, event.target.validity.badInput ? 'Enter a complete, valid value.' : undefined)}
    onBlur={blur} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); blur(); } }}
    className={`w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] ${className}`}
  />}</AutosaveField>;
}

/** Explicit creation drafts survive an in-app refresh, but are never autosaved. */
export function useRetainedDraft<T>(key: string, initial: T): [T, (next: SetStateAction<T>) => void] {
  const store = useAutosave();
  const [value, setValue] = useState<T>(() => (store.drafts.get(key) as T | undefined) ?? initial);
  const update = (next: SetStateAction<T>) => {
    const current = (store.drafts.get(key) as T | undefined) ?? initial;
    const result = typeof next === 'function' ? (next as (value: T) => T)(current) : next;
    store.drafts.set(key, result);
    setValue(result);
  };
  return [value, update];
}
