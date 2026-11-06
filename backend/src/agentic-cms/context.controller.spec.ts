import { BadRequestException } from '@nestjs/common';
import { AgenticCmsController } from './agentic-cms.controller';

describe('Agentic CMS project context endpoints', () => {
  const access = { projectScope: jest.fn(), assertContextWrite: jest.fn() };
  const prisma = {
    project: { findUnique: jest.fn(), update: jest.fn() },
    projectContextNote: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
  };
  let controller: AgenticCmsController;
  const req = { user: { id: 'pm', email: 'pm@example.test', role: 'PM' } };
  beforeEach(() => { jest.resetAllMocks(); controller = new AgenticCmsController(access as any, prisma as any); });
  it('reads overview, scope and notes only after project authorization', async () => {
    prisma.project.findUnique.mockResolvedValue({ id: 'p', name: 'Project', overview: 'Overview', scope: 'Scope' });
    prisma.projectContextNote.findMany.mockResolvedValue([{ id: 'n', title: 'Call', content: 'Text' }]);
    await expect(controller.getContext('p', req)).resolves.toMatchObject({ project: { overview: 'Overview', scope: 'Scope' }, notes: [{ content: 'Text' }] });
    expect(access.projectScope).toHaveBeenCalledWith(req.user, 'p', 'deliverables');
    expect(prisma.project.findUnique).toHaveBeenCalledWith({ where: { id: 'p' }, select: { id: true, name: true, overview: true, scope: true } });
  });
  it('updates overview and scope without changing project description', async () => {
    prisma.project.update.mockResolvedValue({ id: 'p', overview: 'new', scope: 'terms' });
    await controller.saveContext('p', { overview: 'new', scope: 'terms' }, req);
    expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({ data: { overview: 'new', scope: 'terms' } }));
  });
  it('validates and creates pasted notes, and deletes notes scoped to the project', async () => {
    prisma.projectContextNote.create.mockResolvedValue({ id: 'n', title: 'Call', content: 'notes' });
    await expect(controller.addNote('p', { title: ' Call ', content: ' notes ' }, req)).resolves.toMatchObject({ id: 'n' });
    await expect(controller.addNote('p', { title: ' ', content: '' }, req)).rejects.toBeInstanceOf(BadRequestException);
    prisma.projectContextNote.findFirst.mockResolvedValue({ id: 'n' });
    await expect(controller.deleteNote('p', 'n', req)).resolves.toEqual({ deleted: true });
    expect(prisma.projectContextNote.findFirst).toHaveBeenCalledWith({ where: { id: 'n', projectId: 'p' }, select: { id: true } });
  });
});
