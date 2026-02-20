import { Test, TestingModule } from '@nestjs/testing';
import { DeliverablesController } from './deliverables.controller';
import { DeliverablesService } from './deliverables.service';
import { ProjectsService } from '@/projects/projects.service';
import { AuthGuard } from '@/auth/auth.guard';
import { AuthService } from '@/auth/auth.service';
import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

describe('DeliverablesController', () => {
  let controller: DeliverablesController;
  let deliverablesService: DeliverablesService;
  let projectsService: ProjectsService;

  // --- Mocks ---
  const mockDeliverablesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockProjectsService = {
    findOne: jest.fn(),
    isMember: jest.fn(),
  };

  // Mocking AuthService and AuthGuard to pass through
  const mockAuthService = { getUserByEmail: jest.fn() };
  const mockAuthGuard = { canActivate: jest.fn(() => true) };

  // --- Mock Data ---
  const mockAdminUser = { id: 'admin-1', role: 'ADMIN', email: 'admin@otcr.com' };
  const mockPMUser = { id: 'pm-1', role: 'PM', email: 'pm@otcr.com' };
  const mockConsultantUser = { id: 'con-1', role: 'CONSULTANT', email: 'con@otcr.com' };

  const mockProject = { id: 'project-1', pmId: 'pm-1' };
  const mockDeliverable = { 
    id: 'deliverable-1', 
    projectId: 'project-1', 
    title: 'Test Deliverable' 
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeliverablesController],
      providers: [
        { provide: DeliverablesService, useValue: mockDeliverablesService },
        { provide: ProjectsService, useValue: mockProjectsService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: AuthGuard, useValue: mockAuthGuard },
      ],
    }).compile();

    controller = module.get<DeliverablesController>(DeliverablesController);
    deliverablesService = module.get<DeliverablesService>(DeliverablesService);
    projectsService = module.get<ProjectsService>(ProjectsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createDto = {
      projectId: 'project-1',
      title: 'New Deliverable',
      type: 'DOCUMENT',
      deadline: '2024-12-31',
    };

    it('should allow ADMIN to create for any project', async () => {
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockDeliverablesService.create.mockResolvedValue(mockDeliverable);

      const result = await controller.create(createDto, mockAdminUser);

      expect(deliverablesService.create).toHaveBeenCalledWith('project-1', createDto);
      expect(result).toEqual(mockDeliverable);
    });

    it('should allow PM of the project to create', async () => {
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockDeliverablesService.create.mockResolvedValue(mockDeliverable);

      const result = await controller.create(createDto, mockPMUser);

      expect(result).toEqual(mockDeliverable);
    });

    it('should throw ForbiddenException for a PM who does not own the project', async () => {
      const otherPM = { id: 'pm-99', role: 'PM' };
      mockProjectsService.findOne.mockResolvedValue(mockProject); // owned by pm-1

      await expect(controller.create(createDto, otherPM)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    const mockResponse = { deliverables: [mockDeliverable], pagination: { total: 1 } };

    it('should verify project membership for CONSULTANT if projectId is provided', async () => {
      mockProjectsService.isMember.mockResolvedValue(true);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockDeliverablesService.findAll.mockResolvedValue(mockResponse);

      await controller.findAll({ projectId: 'project-1' }, mockConsultantUser);

      expect(projectsService.isMember).toHaveBeenCalledWith('project-1', mockConsultantUser.id);
    });

    it('should auto-assign userId filter for CONSULTANTS', async () => {
      mockDeliverablesService.findAll.mockResolvedValue(mockResponse);

      await controller.findAll({}, mockConsultantUser);

      expect(deliverablesService.findAll).toHaveBeenCalledWith(
        mockConsultantUser,
        expect.objectContaining({ userId: mockConsultantUser.id })
      );
    });

    it('should allow ADMIN to see all deliverables across projects', async () => {
      mockDeliverablesService.findAll.mockResolvedValue(mockResponse);

      await controller.findAll({ overdue: 'true' }, mockAdminUser);

      expect(deliverablesService.findAll).toHaveBeenCalledWith(
        mockAdminUser,
        expect.objectContaining({ overdue: true })
      );
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException if deliverable does not exist', async () => {
      mockDeliverablesService.findOne.mockResolvedValue(null);

      await expect(controller.findOne('non-existent', mockAdminUser)).rejects.toThrow(NotFoundException);
    });

    it('should allow project member to view specific deliverable', async () => {
      mockDeliverablesService.findOne.mockResolvedValue(mockDeliverable);
      mockProjectsService.isMember.mockResolvedValue(true);
      mockProjectsService.findOne.mockResolvedValue(mockProject);

      const result = await controller.findOne('deliverable-1', mockConsultantUser);

      expect(result).toEqual(mockDeliverable);
    });

    it('should block users who are not project members or PM/Admin', async () => {
      mockDeliverablesService.findOne.mockResolvedValue(mockDeliverable);
      mockProjectsService.isMember.mockResolvedValue(false);
      mockProjectsService.findOne.mockResolvedValue(mockProject);

      await expect(controller.findOne('deliverable-1', mockConsultantUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should allow PM of project to update deliverable', async () => {
      mockDeliverablesService.findOne.mockResolvedValue(mockDeliverable);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockDeliverablesService.update.mockResolvedValue({ ...mockDeliverable, status: 'DONE' });

      const result = await controller.update('deliverable-1', { status: 'DONE' }, mockPMUser);

      expect(deliverablesService.update).toHaveBeenCalled();
      expect(result.status).toBe('DONE');
    });

    it('should prevent non-owning PM from updating', async () => {
      const otherPM = { id: 'pm-99', role: 'PM' };
      mockDeliverablesService.findOne.mockResolvedValue(mockDeliverable);
      mockProjectsService.findOne.mockResolvedValue(mockProject);

      await expect(controller.update('deliverable-1', {}, otherPM)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should only allow ADMIN to remove (as per controller role guard/logic)', async () => {
      mockDeliverablesService.findOne.mockResolvedValue(mockDeliverable);
      mockDeliverablesService.remove.mockResolvedValue(mockDeliverable);

      const result = await controller.remove('deliverable-1', mockAdminUser);

      expect(deliverablesService.remove).toHaveBeenCalledWith('deliverable-1');
      expect(result).toEqual(mockDeliverable);
    });
  });
});