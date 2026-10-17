import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseRole, updateAllowedEmailRole } from './access-role';

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
      return { ...person, teams: Array.from(teams.values()).sort((a, b) => a.name.localeCompare(b.name)) };
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
