'use client';

export type AssigneeOption = {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  active?: boolean;
};

export function projectAssignees(project: {
  pm?: AssigneeOption | null;
  members?: Array<{ user?: AssigneeOption | null; leftAt?: string | null }>;
}): AssigneeOption[] {
  const users = [project.pm, ...(project.members ?? []).filter(member => !member.leftAt).map(member => member.user)];
  return Array.from(new Map(users.filter((user): user is AssigneeOption => Boolean(user?.id && user.active !== false))
    .map(user => [user.id, user])).values());
}

export function AssigneeChecklist({ options, selected, onChange, disabled = false, label = 'Assignees' }: {
  options: AssigneeOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  return <fieldset disabled={disabled} className="min-w-0 rounded-lg border border-[var(--border)] p-3">
    <legend className="px-1 text-sm font-semibold">{label}</legend>
    <div className="max-h-48 space-y-2 overflow-y-auto">
      {options.map(person => <label key={person.id} className="flex items-start gap-2 break-words text-sm">
        <input type="checkbox" className="mt-1 shrink-0" checked={selected.includes(person.id)}
          onChange={event => onChange(event.target.checked ? [...selected, person.id] : selected.filter(id => id !== person.id))} />
        <span className="min-w-0 break-all">{[person.firstName, person.lastName].filter(Boolean).join(' ') || person.email || person.id}</span>
      </label>)}
      {!options.length && <p className="text-sm text-[var(--foreground)]/65">No eligible team members.</p>}
    </div>
    <p className="mt-2 text-xs text-[var(--foreground)]/65">{selected.length} selected</p>
  </fieldset>;
}
