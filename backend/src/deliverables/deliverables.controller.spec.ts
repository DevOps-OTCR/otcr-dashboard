import { Test, TestingModule } from '@nestjs/testing';
import { DeliverablesController } from './deliverables.controller';
import { DeliverablesService } from './deliverables.service';
import { AuthService } from '@/auth/auth.service';
import { ProjectsService } from '@/projects/projects.service';
import {
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

describe('DeliverablesController', () => {
  let controller: DeliverablesController;
  let deliverablesService: DeliverablesService;
  let authService: AuthService;
  let projectsService: ProjectsService;

  const mockAuthService = {
    getUserByEmail: jest.fn(),
  };

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

  const mockAdminUser = {
    id: 'admin-1',
    email: 'admin@otcr.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'ADMIN',
  };

  const mockPMUser = {
    id: 'pm-1',
    email: 'pm@otcr.com',
    firstName: 'PM',
    lastName: 'User',
    role: 'PM',
  };

  const mockConsultantUser = {
    id: 'consultant-1',
    email: 'consultant@otcr.com',
    firstName: 'Consultant',
    lastName: 'User',
    role: 'CONSULTANT',
  };

  const mockProject = {
    id: 'project-1',
    name: 'Test Project',
    pmId: 'pm-1',
    pm: mockPMUser,
  };

  const mockDeliverable = {
    id: 'deliverable-1',
    projectId: 'project-1',
    title: 'Test Deliverable',
    description: 'Test Description',
    type: 'DOCUMENT',
    deadline: new Date('2024-12-31'),
    status: 'PENDING',
    project: mockProject,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeliverablesController],
      providers: [
        {
          provide: DeliverablesService,
          useValue: mockDeliverablesService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: ProjectsService,
          useValue: mockProjectsService,
        },
      ],
    }).compile();

    controller = module.get<DeliverablesController>(DeliverablesController);
    deliverablesService = module.get<DeliverablesService>(DeliverablesService);
    authService = module.get<AuthService>(AuthService);
    projectsService = module.get<ProjectsService>(ProjectsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      projectId: 'project-1',
      title: 'New Deliverable',
      description: 'Description',
      type: 'DOCUMENT',
      deadline: '2024-12-31',
    };

    it('should create deliverable when user is ADMIN', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockDeliverablesService.create.mockResolvedValue(mockDeliverable);

      const result = await controller.create(createDto, 'admin@otcr.com');

      expect(authService.getUserByEmail).toHaveBeenCalled();
      expect(projectsService.findOne).toHaveBeenCalledWith('project-1');
      expect(deliverablesService.create).toHaveBeenCalledWith(
        'project-1',
        createDto,
      );
      expect(result).toEqual(mockDeliverable);
    });

    it('should create deliverable when user is PM of project', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockPMUser);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockDeliverablesService.create.mockResolvedValue(mockDeliverable);

      const result = await controller.create(createDto, 'pm@otcr.com');

      expect(result).toEqual(mockDeliverable);
    });

    it('should throw ForbiddenException when PM is not owner', async () => {
      const otherPM = { ...mockPMUser, id: 'other-pm' };
      mockAuthService.getUserByEmail.mockResolvedValue(otherPM);
      mockProjectsService.findOne.mockResolvedValue(mockProject);

      await expect(
        controller.create(createDto, 'other-pm@otcr.com'),
      ).rejects.toThrow(ForbiddenException);

      expect(deliverablesService.create).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is CONSULTANT', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockConsultantUser);
      mockProjectsService.findOne.mockResolvedValue(mockProject);

      await expect(
        controller.create(createDto, 'consultant@otcr.com'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when project not found', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findOne.mockResolvedValue(null);

      await expect(
        controller.create(createDto, 'admin@otcr.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw UnauthorizedException when no auth header', async () => {
      await expect(controller.create(createDto, '')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('findAll', () => {
    const mockResponse = {
      deliverables: [mockDeliverable],
      pagination: {
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    };

    it('should return deliverables for ADMIN', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockDeliverablesService.findAll.mockResolvedValue(mockResponse);

      const result = await controller.findAll({}, 'admin@otcr.com');

      expect(deliverablesService.findAll).toHaveBeenCalledWith(
        mockAdminUser,
        expect.objectContaining({
          page: 1,
          limit: 20,
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('should filter by projectId and check access', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockPMUser);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockDeliverablesService.findAll.mockResolvedValue(mockResponse);

      await controller.findAll(
        { projectId: 'project-1' },
        'pm@otcr.com',
      );

      expect(projectsService.findOne).toHaveBeenCalledWith('project-1');
      expect(deliverablesService.findAll).toHaveBeenCalledWith(
        mockPMUser,
        expect.objectContaining({
          projectId: 'project-1',
        }),
      );
    });

    it('should handle overdue filter', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockDeliverablesService.findAll.mockResolvedValue(mockResponse);

      await controller.findAll({ overdue: 'true' }, 'admin@otcr.com');

      expect(deliverablesService.findAll).toHaveBeenCalledWith(
        mockAdminUser,
        expect.objectContaining({
          overdue: true,
        }),
      );
    });

    it('should handle upcoming filter', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockDeliverablesService.findAll.mockResolvedValue(mockResponse);

      await controller.findAll({ upcoming: '7' }, 'admin@otcr.com');

      expect(deliverablesService.findAll).toHaveBeenCalledWith(
        mockAdminUser,
        expect.objectContaining({
          upcoming: 7,
        }),
      );
    });

    it('should handle status and type filters', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockDeliverablesService.findAll.mockResolvedValue(mockResponse);

      await controller.findAll(
        { status: 'PENDING', type: 'DOCUMENT' },
        'admin@otcr.com',
      );

      expect(deliverablesService.findAll).toHaveBeenCalledWith(
        mockAdminUser,
        expect.objectContaining({
          status: 'PENDING',
          type: 'DOCUMENT',
        }),
      );
    });

    it('should handle pagination params', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockDeliverablesService.findAll.mockResolvedValue(mockResponse);

      await controller.findAll(
        { page: '2', limit: '50' },
        'admin@otcr.com',
      );

      expect(deliverablesService.findAll).toHaveBeenCalledWith(
        mockAdminUser,
        expect.objectContaining({
          page: 2,
          limit: 50,
        }),
      );
    });

    it('should throw ForbiddenException when accessing unauthorized project', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockConsultantUser);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockProjectsService.isMember.mockResolvedValue(false);

      await expect(
        controller.findAll({ projectId: 'project-1' }, 'consultant@otcr.com'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('should return deliverable for authorized user', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockDeliverablesService.findOne.mockResolvedValue(mockDeliverable);
      mockProjectsService.findOne.mockResolvedValue(mockProject);

      const result = await controller.findOne(
        'deliverable-1',
        'admin@otcr.com',
      );

      expect(deliverablesService.findOne).toHaveBeenCalledWith('deliverable-1');
      expect(result).toEqual(mockDeliverable);
    });

    it('should return deliverable for PM of project', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockPMUser);
      mockDeliverablesService.findOne.mockResolvedValue(mockDeliverable);
      mockProjectsService.findOne.mockResolvedValue(mockProject);

      const result = await controller.findOne(
        'deliverable-1',
        'pm@otcr.com',
      );

      expect(result).toEqual(mockDeliverable);
    });

    it('should return deliverable for project member', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockConsultantUser);
      mockDeliverablesService.findOne.mockResolvedValue(mockDeliverable);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockProjectsService.isMember.mockResolvedValue(true);

      const result = await controller.findOne(
        'deliverable-1',
        'consultant@otcr.com',
      );

      expect(result).toEqual(mockDeliverable);
    });

    it('should throw NotFoundException when deliverable not found', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockDeliverablesService.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne('non-existent', 'admin@otcr.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-member', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockConsultantUser);
      mockDeliverablesService.findOne.mockResolvedValue(mockDeliverable);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockProjectsService.isMember.mockResolvedValue(false);

      await expect(
        controller.findOne('deliverable-1', 'consultant@otcr.com'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    const updateDto = {
      title: 'Updated Title',
      status: 'IN_PROGRESS',
    };

    it('should update deliverable when user is ADMIN', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockDeliverablesService.findOne.mockResolvedValue(mockDeliverable);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockDeliverablesService.update.mockResolvedValue({
        ...mockDeliverable,
        ...updateDto,
      });

      const result = await controller.update(
        'deliverable-1',
        updateDto,
        'admin@otcr.com',
      );

      expect(deliverablesService.update).toHaveBeenCalledWith(
        'deliverable-1',
        updateDto,
      );
      expect(result.title).toBe('Updated Title');
    });

    it('should update deliverable when user is PM', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockPMUser);
      mockDeliverablesService.findOne.mockResolvedValue(mockDeliverable);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockDeliverablesService.update.mockResolvedValue({
        ...mockDeliverable,
        ...updateDto,
      });

      const result = await controller.update(
        'deliverable-1',
        updateDto,
        'pm@otcr.com',
      );

      expect(result.title).toBe('Updated Title');
    });

    it('should throw ForbiddenException when PM is not owner', async () => {
      const otherPM = { ...mockPMUser, id: 'other-pm' };
      mockAuthService.getUserByEmail.mockResolvedValue(otherPM);
      mockDeliverablesService.findOne.mockResolvedValue(mockDeliverable);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockProjectsService.isMember.mockResolvedValue(false);

      await expect(
        controller.update('deliverable-1', updateDto, 'other-pm@otcr.com'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when deliverable not found', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockDeliverablesService.findOne.mockResolvedValue(null);

      await expect(
        controller.update('non-existent', updateDto, 'admin@otcr.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete deliverable when user is ADMIN', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockDeliverablesService.findOne.mockResolvedValue(mockDeliverable);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockDeliverablesService.remove.mockResolvedValue(mockDeliverable);

      const result = await controller.remove(
        'deliverable-1',
        'admin@otcr.com',
      );

      expect(deliverablesService.remove).toHaveBeenCalledWith('deliverable-1');
      expect(result).toEqual(mockDeliverable);
    });

    it('should delete deliverable when user is PM', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockPMUser);
      mockDeliverablesService.findOne.mockResolvedValue(mockDeliverable);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockDeliverablesService.remove.mockResolvedValue(mockDeliverable);

      await controller.remove('deliverable-1', 'pm@otcr.com');

      expect(deliverablesService.remove).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is CONSULTANT', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockConsultantUser);
      mockDeliverablesService.findOne.mockResolvedValue(mockDeliverable);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockProjectsService.isMember.mockResolvedValue(false);

      await expect(
        controller.remove('deliverable-1', 'consultant@otcr.com'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});