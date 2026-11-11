import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { AuthService } from '../auth/auth.service';
import { AuthGuard } from '../auth/auth.guard';

describe('ProjectsController PM scope', () => {
  let controller: ProjectsController;
  let projectsService: {
    findAll: jest.Mock;
    findByMember: jest.Mock;
  };
  let authService: Record<string, unknown>;
  let authGuard: Record<string, unknown>;

  const pmUser = { id: 'u-pm', role: 'PM' };

  beforeEach(() => {
    projectsService = {
      findAll: jest.fn().mockResolvedValue({ projects: [] }),
      findByMember: jest.fn().mockResolvedValue({ projects: [] }),
    };
    authService = {};
    authGuard = {};

    controller = new ProjectsController(
      projectsService as unknown as ProjectsService,
      authService as unknown as AuthService,
      authGuard as unknown as AuthGuard,
    );
  });

  it('(1) PM with query { pmId: "u-other" } -> findAll called with pmId "u-pm" (the caller), not "u-other"', async () => {
    await controller.findAll({ pmId: 'u-other' }, 'Bearer x', pmUser);

    expect(projectsService.findAll).toHaveBeenCalledTimes(1);
    const args = projectsService.findAll.mock.calls[0][0];
    expect(args.pmId).toBe('u-pm');
    expect(args.pmId).not.toBe('u-other');
  });

  it('(2) PM with no pmId -> pmId "u-pm"', async () => {
    await controller.findAll({}, 'Bearer x', pmUser);

    expect(projectsService.findAll).toHaveBeenCalledTimes(1);
    expect(projectsService.findAll.mock.calls[0][0].pmId).toBe('u-pm');
  });

  it('(3) ADMIN with pmId "u-other" -> findAll called with pmId "u-other" (admins may filter)', async () => {
    const adminUser = { id: 'u-admin', role: 'ADMIN' };

    await controller.findAll({ pmId: 'u-other' }, 'Bearer x', adminUser);

    expect(projectsService.findAll).toHaveBeenCalledTimes(1);
    expect(projectsService.findAll.mock.calls[0][0].pmId).toBe('u-other');
  });

  it('(4) CONSULTANT -> findByMember called with its id and findAll not called', async () => {
    const consultantUser = { id: 'u-consultant', role: 'CONSULTANT' };

    await controller.findAll({}, 'Bearer x', consultantUser);

    expect(projectsService.findByMember).toHaveBeenCalledTimes(1);
    expect(projectsService.findByMember.mock.calls[0][0]).toBe('u-consultant');
    expect(projectsService.findAll).not.toHaveBeenCalled();
  });
});
