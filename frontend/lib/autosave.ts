/** In-memory drafts, scoped to one signed-in account. No draft is written during hydration. */
export type SaveValue = string | boolean | string[];
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'invalid';
export type FieldOptions<T extends SaveValue = SaveValue> = {
  id: string;
  resource: string;
  label: string;
  href: string;
  value: T;
  delay?: number | null;
  validate?: (value: T) => string | undefined;
  normalize?: (value: T) => T;
  save: (value: T) => Promise<void>;
};
type Entry = FieldOptions & {
  acknowledged: SaveValue;
  uncertain: boolean;
  seenServer: SaveValue;
  version: number;
  status: SaveStatus;
  error?: string;
  timer?: ReturnType<typeof setTimeout>;
  task?: Promise<void>;
  inFlight: boolean;
  requested: boolean;
  mounts: number;
};
const equal = (a: SaveValue, b: SaveValue) => JSON.stringify(a) === JSON.stringify(b);

export class AutosaveStore {
  private fields = new Map<string, Entry>();
  private queues = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();
  private tick = 0;
  private disposed = false;
  /** Used to reject reads that overlap a completed write. */
  writeRevision = 0;
  readonly drafts = new Map<string, unknown>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.tick;
  private emit() { this.tick++; this.listeners.forEach(listener => listener()); }
  get(id: string) { return this.fields.get(id); }
  pending() { return [...this.fields.values()].filter(e => this.dirty(e) || e.inFlight); }
  private dirty(e: Entry) { return !equal(e.value, e.acknowledged) || e.status === 'invalid' || e.uncertain; }

  connect<T extends SaveValue>(options: FieldOptions<T>) {
    this.sync(options);
    return this.mount(options.id);
  }

  mount(id: string) {
    const entry = this.fields.get(id)!;
    entry.mounts++;
    this.emit();
    return () => {
      entry.mounts--;
      this.emit();
      // A collapsed/unmounted editor still saves to its original IDs. StrictMode's
      // immediate remount cancels this flush; the account provider owns final disposal.
      queueMicrotask(() => { if (!entry.mounts && !this.disposed) void this.flush(entry.id); });
    };
  }

  sync<T extends SaveValue>(options: FieldOptions<T>) {
    const old = this.fields.get(options.id);
    const callbacks = options as unknown as FieldOptions;
    if (!old) {
      this.fields.set(options.id, { ...callbacks, acknowledged: options.value, seenServer: options.value,
        version: 0, uncertain: false, status: 'idle', inFlight: false, requested: false, mounts: 0 });
      this.emit();
      return;
    }
    old.save = callbacks.save;
    old.validate = callbacks.validate;
    old.normalize = callbacks.normalize;
    old.label = options.label;
    old.href = options.href;
    old.delay = options.delay;
    // Re-renders and background reads never reset a dirty draft. Remembering the
    // last server prop also prevents an old snapshot from undoing an acknowledged save.
    if (!equal(old.seenServer, options.value)) {
      old.seenServer = options.value;
      if (!this.dirty(old) && !old.inFlight && !equal(old.acknowledged, options.value)) {
        old.value = old.acknowledged = options.value;
        old.status = 'idle';
        this.emit();
      }
    }
  }

  edit(id: string, value: SaveValue, inputError?: string) {
    const e = this.fields.get(id);
    if (!e || this.disposed || (equal(e.value, value) && !inputError && !e.error)) return;
    clearTimeout(e.timer);
    e.value = value;
    e.version++;
    e.error = inputError ?? e.validate?.(value);
    e.status = e.error ? 'invalid' : !equal(e.value, e.acknowledged) || e.uncertain || e.inFlight ? 'dirty' : 'idle';
    this.emit();
    if (!e.error && e.delay !== null) {
      e.timer = setTimeout(() => { e.timer = undefined; void this.enqueue(e); }, e.delay ?? 650);
    }
  }

  private enqueue(e: Entry): Promise<void> {
    clearTimeout(e.timer);
    e.timer = undefined;
    if (this.disposed) return Promise.resolve();
    e.requested = true;
    if (e.task) return e.task;
    const predecessor = this.queues.get(e.resource) ?? Promise.resolve();
    const task = predecessor.then(async () => {
      e.requested = false;
      if (this.disposed || !this.dirty(e) || e.status === 'invalid') return;
      const value = e.normalize?.(e.value) ?? e.value;
      const version = e.version;
      // Capture the writer too: an async request must never inherit another editor's IDs.
      const save = e.save;
      e.inFlight = true;
      e.status = 'saving';
      e.error = undefined;
      this.emit();
      try {
        await save(value);
        e.acknowledged = value;
        e.uncertain = false;
        this.writeRevision++;
        if (e.version === version) { e.value = value; e.status = 'saved'; e.error = undefined; }
        else if ((e.status as SaveStatus) !== 'invalid') e.status = 'dirty';
      } catch {
        e.uncertain = true;
        if ((e.status as SaveStatus) !== 'invalid') {
          e.status = 'error';
          e.error = "Couldn't save";
        }
      } finally {
        e.inFlight = false;
        this.emit();
      }
    }).finally(() => {
      e.task = undefined;
      if (this.queues.get(e.resource) === task) this.queues.delete(e.resource);
      if (e.requested && !this.disposed) void this.enqueue(e);
    });
    e.task = task;
    this.queues.set(e.resource, task);
    return task;
  }

  async flush(id: string): Promise<boolean> {
    const e = this.fields.get(id);
    if (!e || this.disposed) return true;
    // One attempt per failure. New edits, Retry, or a deliberate navigation attempt
    // may try again; a failed request never starts an automatic retry loop.
    await this.enqueue(e);
    while (e.task) await e.task;
    if (e.status === 'error' || e.status === 'invalid') return false;
    if (this.dirty(e)) return this.flush(id);
    return true;
  }

  flushAll = async (): Promise<boolean> => {
    const results = await Promise.all(this.pending().map(e => this.flush(e.id)));
    return results.every(Boolean) && this.pending().length === 0;
  };

  async readFresh<T>(read: () => Promise<T>): Promise<T> {
    // Mutations invalidate the shared API cache. If any completed while this GET
    // was in flight, read that fresh generation before reconciling server props.
    let revision: number;
    let result: T;
    do { revision = this.writeRevision; result = await read(); }
    while (!this.disposed && revision !== this.writeRevision);
    return result;
  }

  dispose() {
    this.disposed = true;
    this.fields.forEach(e => clearTimeout(e.timer));
    this.listeners.clear();
  }
}
