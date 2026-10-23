import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseRole, updateAllowedEmailRole } from './access-role';
import { AccessSummary, normalizeEmail, summarizeAccess } from './access-policy';

export interface PersonSummary extends AccessSummary {
  accessRole: Role | null;
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
    const [grants, requests] = await Promise.all([
      this.prisma.allowedEmail.findMany(),
      this.prisma.onboardingRequest.findMany({ select: { email: true, status: true } }),
    ]);
    return people.map(({ projectAssignments, pmProjects, ...person }) => {
      const email = normalizeEmail(person.email);
      const access = summarizeAccess(
        people.filter(user => user.email.toLowerCase() === email),
        grants.filter(grant => grant.email.toLowerCase() === email),
        requests.find(request => request.email.toLowerCase() === email),
      );
      const teams = new Map(projectAssignments.map(({ project }) => [project.id, { ...project, manages: false }]));
      pmProjects.forEach(project => teams.set(project.id, { ...project, manages: true }));
      return { ...access, ...person, accessRole: access.role, teams: Array.from(teams.values()).sort((a, b) => a.name.localeCompare(b.name)) };
    });
  }

  async changeRole(id: string, value: unknown) {
    const role = parseRole(value);
    return this.prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new NotFoundException('User not found');
      await updateAllowedEmailRole(tx, user.email, role, { mode: 'preserve' });
      return tx.user.update({ where: { id }, data: { role },
        select: { id: true, email: true, role: true } });
    });
  }
}
