import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { AuthService } from '@/auth/auth.service';
import {
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let projectsService: ProjectsService;
  let authService: AuthService;

  const mockAuthService = {
    getUserByEmail: jest.fn(),
  };

  const mockProjectsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByMember: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    addMember: jest.fn(),
    removeMember: jest.fn(),
    getMembers: jest.fn(),
    isMember: jest.fn(),
    getDashboardProjects: jest.fn(),
  };

  const mockAdminUser = {
    id: 'admin-1',
    email: 'admin@otcr.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'ADMIN',
    googleId: 'google-admin-1',
  };

  const mockPMUser = {
    id: 'pm-1',
    email: 'pm@otcr.com',
    firstName: 'PM',
    lastName: 'User',
    role: 'PM',
    googleId: 'google-pm-1',
  };

  const mockConsultantUser = {
    id: 'consultant-1',
    email: 'consultant@otcr.com',
    firstName: 'Consultant',
    lastName: 'User',
    role: 'CONSULTANT',
    googleId: 'google-consultant-1',
  };

  const mockProject = {
    id: 'project-1',
    name: 'Test Project',
    description: 'Test Description',
    clientName: 'Test Client',
    pmId: 'pm-1',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31'),
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    pm: mockPMUser,
    members: [],
    deliverables: [],
    _count: {
      members: 5,
      deliverables: 3,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        {
          provide: ProjectsService,
          useValue: mockProjectsService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<ProjectsController>(ProjectsController);
    projectsService = module.get<ProjectsService>(ProjectsService);
    authService = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const createProjectDto = {
      name: 'New Project',
      description: 'Project Description',
      clientName: 'Client Name',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      memberIds: ['member-1', 'member-2'],
    };

    it('should create a project when user is ADMIN', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.create.mockResolvedValue(mockProject);

      const result = await controller.create(
        createProjectDto,
        'admin@otcr.com',
      );

      expect(authService.getUserByEmail).toHaveBeenCalledWith('admin@otcr.com');
      expect(projectsService.create).toHaveBeenCalledWith(
        createProjectDto,
        mockAdminUser.id,
      );
      expect(result).toEqual(mockProject);
    });

    it('should create a project when user is PM', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockPMUser);
      mockProjectsService.create.mockResolvedValue(mockProject);

      const result = await controller.create(
        createProjectDto,
        'pm@otcr.com',
      );

      expect(authService.getUserByEmail).toHaveBeenCalledWith('pm@otcr.com');
      expect(projectsService.create).toHaveBeenCalledWith(
        createProjectDto,
        mockPMUser.id,
      );
      expect(result).toEqual(mockProject);
    });

    it('should throw ForbiddenException when user is CONSULTANT', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockConsultantUser);

      await expect(
        controller.create(createProjectDto, 'consultant@otcr.com'),
      ).rejects.toThrow(ForbiddenException);

      expect(projectsService.create).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when no authorization header', async () => {
      await expect(controller.create(createProjectDto, '')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(null);

      await expect(
        controller.create(createProjectDto, ''),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('findAll', () => {
    const mockResponse = {
      projects: [mockProject],
      pagination: {
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      },
    };

    it('should return all projects for ADMIN', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findAll.mockResolvedValue(mockResponse);

      const result = await controller.findAll({}, 'admin@otcr.com');

      expect(projectsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          limit: 10,
          includeMembers: false,
          includeDeliverables: false,
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('should filter by status', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findAll.mockResolvedValue(mockResponse);

      await controller.findAll(
        { status: 'ACTIVE' },
        'admin@otcr.com',
      );

      expect(projectsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ACTIVE',
        }),
      );
    });

    it('should search projects', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findAll.mockResolvedValue(mockResponse);

      await controller.findAll(
        { search: 'test' },
        'admin@otcr.com',
      );

      expect(projectsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'test',
        }),
      );
    });

    it('should filter by pmId', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findAll.mockResolvedValue(mockResponse);

      await controller.findAll(
        { pmId: 'pm-1' },
        'admin@otcr.com',
      );

      expect(projectsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          pmId: 'pm-1',
        }),
      );
    });

    it('should filter by userId (member)', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findAll.mockResolvedValue(mockResponse);

      await controller.findAll(
        { userId: 'user-1' },
        'admin@otcr.com',
      );

      expect(projectsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
        }),
      );
    });

    it('should include members when requested', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findAll.mockResolvedValue(mockResponse);

      await controller.findAll(
        { includeMembers: 'true' },
        'admin@otcr.com',
      );

      expect(projectsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          includeMembers: true,
        }),
      );
    });

    it('should include deliverables when requested', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findAll.mockResolvedValue(mockResponse);

      await controller.findAll(
        { includeDeliverables: 'true' },
        'admin@otcr.com',
      );

      expect(projectsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          includeDeliverables: true,
        }),
      );
    });

    it('should handle pagination parameters', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findAll.mockResolvedValue(mockResponse);

      await controller.findAll(
        { page: '2', limit: '20' },
        'admin@otcr.com',
      );

      expect(projectsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          limit: 20,
        }),
      );
    });

    it('should return PM projects with pmId filter when user is PM', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockPMUser);
      mockProjectsService.findAll.mockResolvedValue(mockResponse);

      await controller.findAll({}, 'pm@otcr.com');

      expect(projectsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          pmId: mockPMUser.id,
        }),
      );
    });

    it('should return member projects for CONSULTANT', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockConsultantUser);
      mockProjectsService.findByMember.mockResolvedValue(mockResponse);

      const result = await controller.findAll({}, 'consultant@otcr.com');

      expect(projectsService.findByMember).toHaveBeenCalledWith(
        mockConsultantUser.id,
        expect.objectContaining({
          page: 1,
          limit: 10,
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('should allow PM to override pmId filter', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockPMUser);
      mockProjectsService.findAll.mockResolvedValue(mockResponse);

      await controller.findAll(
        { pmId: 'other-pm' },
        'pm@otcr.com',
      );

      expect(projectsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          pmId: 'other-pm',
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return project for ADMIN', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findOne.mockResolvedValue(mockProject);

      const result = await controller.findOne('project-1', {}, 'admin@otcr.com');

      expect(projectsService.findOne).toHaveBeenCalledWith('project-1', {
        includeMembers: false,
        includeDeliverables: false,
      });
      expect(result).toEqual(mockProject);
    });

    it('should return project with members when requested', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findOne.mockResolvedValue(mockProject);

      await controller.findOne(
        'project-1',
        { includeMembers: 'true' },
        'admin@otcr.com',
      );

      expect(projectsService.findOne).toHaveBeenCalledWith('project-1', {
        includeMembers: true,
        includeDeliverables: false,
      });
    });

    it('should return project with deliverables when requested', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findOne.mockResolvedValue(mockProject);

      await controller.findOne(
        'project-1',
        { includeDeliverables: 'true' },
        'admin@otcr.com',
      );

      expect(projectsService.findOne).toHaveBeenCalledWith('project-1', {
        includeMembers: false,
        includeDeliverables: true,
      });
    });

    it('should return project for PM who owns it', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockPMUser);
      mockProjectsService.findOne.mockResolvedValue(mockProject);

      const result = await controller.findOne('project-1', {}, 'pm@otcr.com');

      expect(result).toEqual(mockProject);
    });

    it('should return project for member', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockConsultantUser);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockProjectsService.isMember.mockResolvedValue(true);

      const result = await controller.findOne('project-1', {}, 'consultant@otcr.com');

      expect(projectsService.isMember).toHaveBeenCalledWith(
        'project-1',
        mockConsultantUser.id,
      );
      expect(result).toEqual(mockProject);
    });

    it('should throw NotFoundException when project not found', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne('non-existent', {}, 'admin@otcr.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not member', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockConsultantUser);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockProjectsService.isMember.mockResolvedValue(false);

      await expect(
        controller.findOne('project-1', {}, 'consultant@otcr.com'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    const updateDto = {
      name: 'Updated Project',
      description: 'Updated Description',
      status: 'COMPLETED' as const,
    };

    it('should update project when user is ADMIN', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockProjectsService.update.mockResolvedValue({
        ...mockProject,
        ...updateDto,
      });

      const result = await controller.update(
        'project-1',
        updateDto,
        'admin@otcr.com',
      );

      expect(projectsService.update).toHaveBeenCalledWith('project-1', updateDto);
      expect(result.name).toBe('Updated Project');
    });

    it('should update project when user is the PM', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockPMUser);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockProjectsService.update.mockResolvedValue({
        ...mockProject,
        ...updateDto,
      });

      const result = await controller.update(
        'project-1',
        updateDto,
        'pm@otcr.com',
      );

      expect(result.name).toBe('Updated Project');
    });

    it('should throw ForbiddenException when PM is not owner', async () => {
      const otherPM = { ...mockPMUser, id: 'other-pm' };
      mockAuthService.getUserByEmail.mockResolvedValue(otherPM);
      mockProjectsService.findOne.mockResolvedValue(mockProject);

      await expect(
        controller.update('project-1', updateDto, 'other-pm@otcr.com'),
      ).rejects.toThrow(ForbiddenException);

      expect(projectsService.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when project not found', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findOne.mockResolvedValue(null);

      await expect(
        controller.update('non-existent', updateDto, 'admin@otcr.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete project when user is ADMIN', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.remove.mockResolvedValue(mockProject);

      const result = await controller.remove('project-1', 'admin@otcr.com');

      expect(projectsService.remove).toHaveBeenCalledWith('project-1');
      expect(result).toEqual(mockProject);
    });

    it('should throw ForbiddenException when user is PM', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockPMUser);

      await expect(
        controller.remove('project-1', 'pm@otcr.com'),
      ).rejects.toThrow(ForbiddenException);

      expect(projectsService.remove).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is CONSULTANT', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockConsultantUser);

      await expect(
        controller.remove('project-1', 'consultant@otcr.com'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('addMember', () => {
    const addMemberDto = { userId: 'new-member' };
    const mockMember = {
      id: 'member-1',
      projectId: 'project-1',
      userId: 'new-member',
      joinedAt: new Date(),
      user: mockConsultantUser,
    };

    it('should add member when user is ADMIN', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockProjectsService.addMember.mockResolvedValue(mockMember);

      const result = await controller.addMember(
        'project-1',
        addMemberDto,
        'admin@otcr.com',
      );

      expect(projectsService.addMember).toHaveBeenCalledWith(
        'project-1',
        'new-member',
      );
      expect(result).toEqual(mockMember);
    });

    it('should add member when user is the PM', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockPMUser);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockProjectsService.addMember.mockResolvedValue(mockMember);

      const result = await controller.addMember(
        'project-1',
        addMemberDto,
        'pm@otcr.com',
      );

      expect(result).toEqual(mockMember);
    });

    it('should throw ForbiddenException when PM is not owner', async () => {
      const otherPM = { ...mockPMUser, id: 'other-pm' };
      mockAuthService.getUserByEmail.mockResolvedValue(otherPM);
      mockProjectsService.findOne.mockResolvedValue(mockProject);

      await expect(
        controller.addMember('project-1', addMemberDto, 'other-pm@otcr.com'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when project not found', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findOne.mockResolvedValue(null);

      await expect(
        controller.addMember('non-existent', addMemberDto, 'admin@otcr.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeMember', () => {
    it('should remove member when user is ADMIN', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockAdminUser);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockProjectsService.removeMember.mockResolvedValue({
        id: 'member-1',
        leftAt: new Date(),
      });

      const result = await controller.removeMember(
        'project-1',
        'member-1',
        'admin@otcr.com',
      );

      expect(projectsService.removeMember).toHaveBeenCalledWith(
        'project-1',
        'member-1',
      );
      expect(result).toBeDefined();
    });

    it('should remove member when user is the PM', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockPMUser);
      mockProjectsService.findOne.mockResolvedValue(mockProject);
      mockProjectsService.removeMember.mockResolvedValue({
        id: 'member-1',
        leftAt: new Date(),
      });

      await controller.removeMember(
        'project-1',
        'member-1',
        'pm@otcr.com',
      );

      expect(projectsService.removeMember).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is not PM or ADMIN', async () => {
      mockAuthService.getUserByEmail.mockResolvedValue(mockConsultantUser);
      mockProjectsService.findOne.mockResolvedValue(mockProject);

      await expect(
        controller.removeMember('project-1', 'member-1', 'consultant@otcr.com'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});