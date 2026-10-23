'use client';

import { AutosaveField, AutosaveInput } from './Autosave';
import { deliverablesAPI, projectsAPI } from '@/lib/api';
import { optionalDateTime, toLocalDateTime, validDateTime, validTime, validTimezone, validTitle } from '@/lib/autosave-validation';

export function DeadlineEditor({ id, sprintId, deadline, href, onSaved }: {
  id: string; sprintId: string; deadline: string; href: string; onSaved: (deadline: string) => void;
}) {
  return <AutosaveInput id={`deliverable:${id}:deadline`} resource={`sprint:${sprintId}`} label="Deliverable due date"
    href={href} type="datetime-local" value={toLocalDateTime(deadline)} delay={null} validate={validDateTime}
    save={async value => {
      const deadline = new Date(value).toISOString();
      await deliverablesAPI.updateDeadline(id, deadline);
      onSaved(deadline);
    }} />;
}

type Person = { id: string; email?: string; firstName?: string; lastName?: string };
export type EditableSubtask = { id: string; title: string; dueDate?: string | null; assigneeId?: string | null; completed: boolean; assignee?: Person | null };
export function SubtaskEditors({ subtask, members, onSaved }: {
  subtask: EditableSubtask; members: Person[]; onSaved: (patch: Partial<EditableSubtask>) => void;
}) {
  const base = { resource: `subtask:${subtask.id}`, href: '/deliverables' };
  const save = async (patch: Partial<EditableSubtask>) => {
    const response = await deliverablesAPI.updateSubtask(subtask.id, patch);
    // A response may contain old values for other fields. Apply only our patch.
    onSaved('assigneeId' in patch ? { ...patch, assignee: response.data.assignee ?? null } : patch);
  };
  return <>
    <AutosaveInput {...base} id={`${base.resource}:title`} label="Subtask title" normalize={value => value.trim()} value={subtask.title} validate={validTitle}
      save={value => save({ title: value.trim() })} />
    <AutosaveField {...base} id={`${base.resource}:assignee`} label="Subtask assignee" value={subtask.assigneeId ?? ''} delay={0}
      save={value => save({ assigneeId: value || null })}>
      {({ value, change, blur }) => <select aria-label="Subtask assignee" value={value} onChange={e => change(e.target.value)} onBlur={blur}
        className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
        <option value="">Unassigned</option>
        {Array.from(new Map([...(subtask.assignee ? [subtask.assignee] : []), ...members].map(member => [member.id, member])).values()).map(member =>
          <option key={member.id} value={member.id}>{[member.firstName, member.lastName].filter(Boolean).join(' ') || member.email || 'Team member'}</option>)}
      </select>}
    </AutosaveField>
    <AutosaveInput {...base} id={`${base.resource}:dueDate`} label="Subtask due date" type="datetime-local"
      value={subtask.dueDate ? toLocalDateTime(subtask.dueDate) : ''} delay={null} validate={optionalDateTime}
      save={value => save({ dueDate: value ? new Date(value).toISOString() : null })} />
    <AutosaveField {...base} id={`${base.resource}:completed`} label="Subtask completion" value={subtask.completed} delay={0}
      save={value => save({ completed: value })}>
      {({ value, change }) => <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
        <input type="checkbox" checked={value} onChange={e => change(e.target.checked)} />Done
      </label>}
    </AutosaveField>
  </>;
}

const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
type Schedule = { sprintStartDay: string; initialSlideDueDay: string; finalSlideDueDay: string; defaultDueTime: string; sprintTimezone: string; autoGenerateSprints: boolean };
export function ScheduleEditors({ projectId, config, onSaved }: { projectId: string; config: Schedule; onSaved: (patch: Partial<Schedule>) => void }) {
  const base = { resource: `project:${projectId}:schedule`, href: '/teams' };
  const save = async (patch: Partial<Schedule>) => {
    await projectsAPI.updateSprintConfig(projectId, patch);
    onSaved(patch);
  };
  return <div className="grid gap-3 md:grid-cols-2">
    {(['sprintStartDay', 'initialSlideDueDay', 'finalSlideDueDay'] as const).map((field, i) => <label key={field} className="space-y-1 text-sm">
      <span>{['Sprint starts on', 'Initial Slides due day', 'Final Slides due day'][i]}</span>
      <AutosaveField {...base} id={`${base.resource}:${field}`} label={['Sprint starts on', 'Initial Slides due day', 'Final Slides due day'][i]}
        value={config[field]} delay={0} validate={value => days.includes(value) ? undefined : 'Choose a weekday.'}
        save={value => save({ [field]: value })}>
        {({ value, change, blur }) => <select value={value} onChange={e => change(e.target.value)} onBlur={blur}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2">
          {days.map(day => <option key={day} value={day}>{day.charAt(0) + day.slice(1).toLowerCase()}</option>)}
        </select>}
      </AutosaveField>
    </label>)}
    <label className="space-y-1 text-sm"><span>Default due time</span>
      <AutosaveInput {...base} id={`${base.resource}:defaultDueTime`} label="Default due time" type="time" value={config.defaultDueTime}
        delay={null} validate={validTime} save={value => save({ defaultDueTime: value })} />
    </label>
    <label className="space-y-1 text-sm"><span>Timezone</span>
      <AutosaveInput {...base} id={`${base.resource}:sprintTimezone`} label="Timezone" value={config.sprintTimezone}
        validate={validTimezone} normalize={value => value.trim()} save={value => save({ sprintTimezone: value.trim() })} />
    </label>
    <AutosaveField {...base} id={`${base.resource}:autoGenerateSprints`} label="Auto-generate sprint templates" value={config.autoGenerateSprints}
      delay={0} save={value => save({ autoGenerateSprints: value })}>
      {({ value, change }) => <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value} onChange={e => change(e.target.checked)} />Auto-generate weekly sprint templates for this team
      </label>}
    </AutosaveField>
  </div>;
}
