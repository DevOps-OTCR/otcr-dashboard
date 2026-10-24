'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { ROLE_FULL_LABELS, type AppRole } from '@/lib/permissions';
import { CMS_ROLES, safePersonName, type Person } from './types';

// Add typed per-person display fields here as the directory grows.
const columns: Array<{ key: string; label: string; render: (person: Person) => ReactNode }> = [
  { key: 'name', label: 'Name', render: safePersonName },
  { key: 'email', label: 'Email', render: person => person.email },
  { key: 'status', label: 'Status', render: person => person.active ? 'Active' : 'Inactive' },
  { key: 'role', label: 'Current role', render: person => ROLE_FULL_LABELS[person.role] },
  { key: 'teams', label: 'Teams / projects', render: person => person.teams.length
    ? person.teams.map(team => `${team.name}${team.manages ? ' (PM)' : ''}`).join(', ') : 'No current teams' },
];
const fieldClass = 'min-w-0 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm';

export function PeopleDirectory({ people, busy, onChangeRole }: {
  people: Person[]; busy: boolean; onChangeRole: (person: Person, role: AppRole) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [team, setTeam] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [roles, setRoles] = useState<Record<string, AppRole>>({});
  const teams = Array.from(new Map(people.flatMap(person => person.teams).map(item => [item.id, item])).values())
    .sort((a, b) => a.name.localeCompare(b.name));
  const query = search.trim().toLowerCase();
  const filtered = people.filter(person => (!role || person.role === role)
    && (!team || person.teams.some(item => item.id === team))
    && (!status || person.active === (status === 'active'))
    && `${safePersonName(person)} ${person.email}`.toLowerCase().includes(query))
    .sort((a, b) => (sort === 'email' ? a.email.localeCompare(b.email) : sort === 'role'
      ? a.role.localeCompare(b.role) : safePersonName(a).localeCompare(safePersonName(b))) || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 25, currentPage * 25);

  return <section aria-labelledby="directory-title" className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
    <h2 id="directory-title" className="text-lg font-semibold">People directory</h2>
    <div className="flex flex-wrap gap-3">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">Search people
        <input className={fieldClass} value={search} placeholder="Search name or email" onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </label>
      <label className="flex flex-col gap-1 text-sm">Role filter
        <select aria-label="Role filter" className={fieldClass} value={role} onChange={e => { setRole(e.target.value); setPage(1); }}>
          <option value="">All roles</option>{CMS_ROLES.map(item => <option key={item} value={item}>{ROLE_FULL_LABELS[item]}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">Team filter
        <select aria-label="Team filter" className={fieldClass} value={team} onChange={e => { setTeam(e.target.value); setPage(1); }}>
          <option value="">All teams</option>{teams.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">Status filter
        <select aria-label="Status filter" className={fieldClass} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">Sort by
        <select aria-label="Sort by" className={fieldClass} value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>
          <option value="name">Name</option><option value="email">Email</option><option value="role">Role</option>
        </select>
      </label>
    </div>
    {!people.length ? <p>No CMS users yet.</p> : !filtered.length ? <p>No people match your filters.</p> : <>
      <p className="text-sm text-[var(--foreground)]/65">{filtered.length} people</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr>{columns.map(column => <th key={column.key} scope="col" className="px-3 py-2">{column.label}</th>)}<th scope="col" className="px-3 py-2">Change role</th></tr></thead>
          <tbody>{visible.map(person => <tr key={person.id} className="border-t border-[var(--border)] align-middle">
            {columns.map(column => <td key={column.key} className="px-3 py-3">{column.render(person)}</td>)}
            <td className="px-3 py-3"><div className="flex min-w-max items-center gap-2">
              <select aria-label={`Role for ${person.email}`} className={fieldClass} disabled={busy}
                value={roles[person.id] ?? person.role} onChange={e => setRoles(current => ({ ...current, [person.id]: e.target.value as AppRole }))}>
                {CMS_ROLES.map(item => <option key={item} value={item}>{ROLE_FULL_LABELS[item]}</option>)}
              </select>
              <Button size="sm" variant="outline" disabled={busy || !roles[person.id] || roles[person.id] === person.role}
                onClick={() => void onChangeRole(person, roles[person.id])}>Save role</Button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</Button>
        <span>Page {currentPage} of {pages}</span>
        <Button size="sm" variant="outline" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next</Button>
      </div>
    </>}
  </section>;
}
