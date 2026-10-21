import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseRole, updateAllowedEmailRole } from './access-role';

// Decodes a potentially JWT-/base64-encoded value back to a plain string.
// Handles the case where the backend returns a full JWT claim (e.g. eyJ...)
// or a base64-encoded JSON payload. Returns the original value if decoding fails.
function decodeEncodedValue(value: string): string {
  if (!value) return value;
  // If it looks like a JWT (3 parts separated by dots) or base64 JSON, try to decode it.
  const trimmed = value.trim();
  // JWT: payload is the middle base64 segment between two dots
  if (trimmed.match(/^[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+$/)) {
    try {
      const payloadBase64 = trimmed.split('.')[1];
      // Pad base64 if needed
      const padded = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(atob(padded));
      if (typeof decoded === 'object' && decoded !== null && decoded.name) return String(decoded.name);
      if (typeof decoded === 'object' && decoded !== null && decoded.firstName) return String(decoded.firstName);
      if (typeof decoded === 'object' && decoded !== null && decoded.first_name) return String(decoded.first_name);
      return '';
    } catch {
      // fall through to return original
    }
  }
  // Try base64 JSON decode (no dots, just a base64 string that decodes to JSON)
  try {
    const padded = trimmed.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(padded));
    if (typeof decoded === 'object' && decoded !== null && decoded.name) return String(decoded.name);
    if (typeof decoded === 'object' && decoded !== null && decoded.firstName) return String(decoded.firstName);
    if (typeof decoded === 'object' && decoded !== null && decoded.first_name) return String(decoded.first_name);
    return '';
  } catch {
    // fall through to return original
  }
  return trimmed;
}

/** Normalize a PersonSummary from the DB, decoding any encoded name fields. */
function normalizePerson(person: { id: string; email: string; firstName: string | null; lastName: string | null; role: Role; active: boolean; teams?: PersonSummary['teams'] }): PersonSummary {
  const decodedFirstName = decodeEncodedValue(person.firstName ?? '');
  const decodedLastName = decodeEncodedValue(person.lastName ?? '');
  // If both decoded values are empty/identical to original and original looks encoded, fallback to email-derived name
  const firstName = decodedFirstName && decodedFirstName !== person.firstName ? decodedFirstName : (person.firstName ?? '');
  const lastName = decodedLastName && decodedLastName !== person.lastName ? decodedLastName : (person.lastName ?? '');
  return {
    id: person.id,
    email: person.email,
    firstName: firstName || null,
    lastName: lastName || null,
    role: person.role,
    active: person.active,
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
