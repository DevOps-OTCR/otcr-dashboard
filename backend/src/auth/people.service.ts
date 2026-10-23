import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseRole, updateAllowedEmailRole } from './access-role';

// Decode stored name data for display only. These claims do not establish identity.
function decodeEncodedValue(value: string | null, field: 'firstName' | 'lastName'): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  const jwt = /^[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+$/.exec(trimmed);
  const payload = jwt ? jwt[1] : trimmed;
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(payload)) return trimmed;

  const json = Buffer.from(payload, 'base64url').toString('utf8').trim();
  if (!jwt && !/^[{["]/.test(json)) return trimmed;
  try {
    const decoded: unknown = JSON.parse(json);
    if (typeof decoded === 'string') return decoded.trim();
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return '';
    const claims = decoded as Record<string, unknown>;
    const fields = field === 'firstName'
      ? ['firstName', 'first_name', 'given_name', 'name']
      : ['lastName', 'last_name', 'family_name', 'name'];
    for (const key of fields) {
      const name = claims[key];
      if (typeof name === 'string' && name.trim()) return name.trim();
    }
  } catch {
    // Recognized encoded input without a usable name falls back to email in the UI.
  }
  return '';
}

function normalizePerson(person: Omit<PersonSummary, 'teams'> & { teams?: PersonSummary['teams'] }): PersonSummary {
  return {
    ...person,
    firstName: decodeEncodedValue(person.firstName, 'firstName') || null,
    lastName: decodeEncodedValue(person.lastName, 'lastName') || null,
    teams: person.teams ?? [],
  };
}

export interface PersonSummary {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  active: boolean;
  teams: Array<{ id: string; name: string; manages: boolean }>;
}

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PersonSummary[]> {
    const people = await this.prisma.user.findMany({
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { email: 'asc' }],
      select: {
        id: true, email: true, firstName: true, lastName: true, role: true, active: true,
        projectAssignments: { where: { leftAt: null }, select: { project: { select: { id: true, name: true } } } },
        pmProjects: { select: { id: true, name: true } },
      },
    });
    return people.map(({ projectAssignments, pmProjects, ...person }) => {
      const teams = new Map(projectAssignments.map(({ project }) => [project.id, { ...project, manages: false }]));
      pmProjects.forEach(project => teams.set(project.id, { ...project, manages: true }));
      return normalizePerson({
        ...person,
        teams: Array.from(teams.values()).sort((a, b) => a.name.localeCompare(b.name)),
        firstName: person.firstName,
        lastName: person.lastName,
      });
    });
  }

  async changeRole(id: string, value: unknown) {
    const role = parseRole(value);
    return this.prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new NotFoundException('User not found');
      await updateAllowedEmailRole(tx, user.email, role, { mode: 'preserve', activeOnCreate: user.active });
      return tx.user.update({ where: { id }, data: { role },
        select: { id: true, email: true, role: true } });
    });
  }
}
