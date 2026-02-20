import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { AuthService } from '@/auth/auth.service';
import { AuthGuard } from '@/auth/auth.guard';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let projectsService: ProjectsService;

  // --- Mocks ---
  const mockProjectsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByMember: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    addMember: jest.fn(),
    removeMember: jest.fn(),
    isMember: jest.fn(),
  };

  const mockAuthService = {
    getUserByEmail: jest.fn(),
  };

  // --- Mock Data ---
  const mockAdminUser = { id: 'admin-1', email: 'admin@otcr.com', role: 'ADMIN' };
  const mockPMUser = { id: 'pm-1', email: 'pm@otcr.com', role: 'PM' };
  const mockConsultantUser = { id: 'consultant-1', email: 'con@otcr.com', role: 'CONSULTANT' };

  const mockProject = {
    id: 'project-1',
    name: 'Test Project',
    pmId: 'pm-1',
    status: 'ACTIVE',
  };

  const mockResponse = {
    projects: [mockProject],
    pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        { provide: ProjectsService, useValue: mockProjectsService },
        { provide: AuthService, useValue: mockAuthService },
        { 
          provide: AuthGuard, 
          useValue: { canActivate: jest.fn(() => true) } 
        },
      ],
    }).compile();

    controller = module.get<ProjectsController>(ProjectsController);
    projectsService = module.get<ProjectsService>(ProjectsService);
    jest.clearAllMocks();
  });

  // --- Tests ---

  describe('create', () => {
    const createDto = { name: 'New Proj', startDate: '2024-01-01' };

    it('should allow ADMIN to create', async () => {
      mockProjectsService.create.mockResolvedValue(mockProject);
      
      const result = await controller.create(createDto, 'Bearer token', mockAdminUser);
      
      expect(projectsService.create).toHaveBeenCalledWith(createDto, mockAdminUser.id);
      expect(result).toEqual(mockProject);
    });

    it('should throw ForbiddenException for CONSULTANT', async () => {
      await expect(
        controller.create(createDto, 'Bearer token', mockConsultantUser)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('should call findByMember for CONSULTANT', async () => {
      mockProjectsService.findByMember.mockResolvedValue(mockResponse);
      
      await controller.findAll({}, 'Bearer token', mockConsultantUser);
      
      expect(projectsService.findByMember).toHaveBeenCalledWith(
        mockConsultantUser.id, 
        expect.any(Object)
      );
    });

    it('should auto-filter by pmId for PM', async () => {
      mockProjectsService.findAll.mockResolvedValue(mockResponse);
      
      await controller.findAll({}, 'Bearer token', mockPMUser);
      
      expect(projectsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ pmId: mockPMUser.id })
      );
    });

    it('should allow ADMIN to see everything without auto-filtering by pmId', async () => {
      mockProjectsService.findAll.mockResolvedValue(mockResponse);
      
      await controller.findAll({ search: 'test' }, 'Bearer token', mockAdminUser);
      
      expect(projectsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'test', pmId: undefined })
      );
    });
  });

  describe('findOne', () => {
    it('should allow access if user is project PM', async () => {
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      
      const result = await controller.findOne('project-1', {}, 'Bearer token', mockPMUser);
      
      expect(result).toEqual(mockProject);
    });

    it('should check membership for CONSULTANT', async () => {
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockProjectsService.isMember.mockResolvedValue(true);

      await controller.findOne('project-1', {}, 'Bearer token', mockConsultantUser);
      
      expect(projectsService.isMember).toHaveBeenCalledWith('project-1', mockConsultantUser.id);
    });

    it('should throw Forbidden if CONSULTANT is not a member', async () => {
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockProjectsService.isMember.mockResolvedValue(false);

      await expect(
        controller.findOne('project-1', {}, 'Bearer token', mockConsultantUser)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    const updateDto = { name: 'Updated Name' };

    it('should throw Forbidden if a PM tries to update a project they do not own', async () => {
      const otherPM = { id: 'pm-99', role: 'PM' };
      mockProjectsService.findOne.mockResolvedValue(mockProject); // mockProject.pmId is 'pm-1'

      await expect(
        controller.update('project-1', updateDto, 'Bearer token', otherPM)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow ADMIN to update any project', async () => {
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockProjectsService.update.mockResolvedValue({ ...mockProject, name: 'Updated' });

      const result = await controller.update('project-1', updateDto, 'Bearer token', mockAdminUser);
      
      expect(result.name).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('should only allow ADMIN to delete', async () => {
      mockProjectsService.remove.mockResolvedValue(mockProject);

      await controller.remove('project-1', 'Bearer token', mockAdminUser);
      expect(projectsService.remove).toHaveBeenCalled();

      await expect(
        controller.remove('project-1', 'Bearer token', mockPMUser)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('member management', () => {
    it('should allow PM owner to add members', async () => {
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      
      await controller.addMember('project-1', { userId: 'u2' }, 'Bearer token', mockPMUser);
      
      expect(projectsService.addMember).toHaveBeenCalledWith('project-1', 'u2');
    });

    it('should allow PM owner to remove members', async () => {
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      
      await controller.removeMember('project-1', 'u2', 'Bearer token', mockPMUser);
      
      expect(projectsService.removeMember).toHaveBeenCalledWith('project-1', 'u2');
    });
  });
});