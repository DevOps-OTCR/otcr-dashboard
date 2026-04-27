import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SlideSubmissionsService {
  private static readonly SLIDE_TASK_MARKER_PREFIX = '[[SLIDE_DELIVERABLE_ID:';

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  private getDisplayName(firstName?: string | null, lastName?: string | null, email?: string | null): string {
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    return fullName || 'Team member';
  }

  private getLateByMinutes(deadline: Date, submittedAt: Date): number {
    return Math.max(0, Math.floor((submittedAt.getTime() - deadline.getTime()) / 60000));
  }

  async submitSlide(
    userId: string,
    deliverableId: string,
    presentationLink: string,
    fileName?: string,
    mimeType?: string,
  ) {
    const trimmedLink = presentationLink.trim();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmedLink);
    } catch {
      throw new BadRequestException('Invalid submission link URL');
    }

    if (!this.isWordOrPowerPointLink(parsedUrl)) {
      throw new BadRequestException(
        'Submission link must be a Microsoft PowerPoint or Word link',
      );
    }

    const deliverable = await this.prisma.deliverable.findUnique({
      where: { id: deliverableId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            pmId: true,
          },
        },
      },
    });

    if (!deliverable) {
      throw new NotFoundException('Deliverable not found');
    }

    const latest = await this.prisma.submission.findFirst({
      where: { deliverableId, userId },
      orderBy: { version: 'desc' },
    });

    const nextVersion = latest ? latest.version + 1 : 1;
    const submittedAt = new Date();
    const isLate = submittedAt.getTime() > deliverable.deadline.getTime();

    const submission = await this.prisma.submission.create({
      data: {
        deliverableId,
        userId,
        fileUrl: trimmedLink,
        fileName: fileName?.trim() || `submission-v${nextVersion}.url`,
        fileSize: 0,
        mimeType: mimeType?.trim() || 'text/uri-list',
        version: nextVersion,
        status: 'PENDING_REVIEW',
        submittedAt,
        isLate,
      },
      include: {
        submitter: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        deliverable: {
          select: {
            id: true,
            title: true,
            project: {
              select: {
                id: true,
                name: true,
                pmId: true,
              },
            },
          },
        },
      },
    });

    await this.prisma.deliverable.update({
      where: { id: deliverableId },
      data: { status: 'SUBMITTED' },
    });

    await this.notifyPMsAndLCs(submission, {
      deadline: deliverable.deadline,
      isLate,
      submittedAt,
    });
    return submission;
  }

  private isWordOrPowerPointLink(url: URL): boolean {
    const normalized = `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
    const hasFileExtension = /\.(ppt|pptx|doc|docx)(?:$|[/?#&])/i.test(normalized);
    const hasOfficeKeyword = /\b(powerpoint|word)\b/i.test(normalized);
    const isSharePointOfficeLink =
      url.hostname.toLowerCase().includes('.sharepoint.com') &&
      /\/:(w|p):\//i.test(url.pathname);
    const isOfficeHost =
      normalized.includes('powerpoint.office.com') ||
      normalized.includes('word.office.com');

    return hasFileExtension || hasOfficeKeyword || isSharePointOfficeLink || isOfficeHost;
  }

  private async notifyPMsAndLCs(submission: {
    submitter: { id: string; firstName: string | null; lastName: string | null; email: string };
    deliverable: { title: string; project: { id: string; pmId: string; name: string } | null };
    fileUrl: string;
    submittedAt: Date;
    id: string;
  }, options?: { deadline?: Date; isLate?: boolean; submittedAt?: Date }) {
    const projectId = submission.deliverable.project?.id;
    const projectPmId = submission.deliverable.project?.pmId;
    const projectName = submission.deliverable.project?.name;

    if (!projectId || !projectPmId) return;

    const submitter = await this.prisma.user.findUnique({
      where: { id: submission.submitter.id },
      select: {
        role: true,
      },
    });

    const projectLcs = await this.prisma.projectMember.findMany({
      where: {
        projectId,
        leftAt: null,
        user: {
          role: 'LC',
          active: true,
        },
      },
      select: { userId: true },
    });

    const submitterName = this.getDisplayName(
      submission.submitter.firstName,
      submission.submitter.lastName,
      submission.submitter.email,
    );

    const reviewerIds = new Set<string>([projectPmId, ...projectLcs.map((member) => member.userId)]);

    for (const reviewerId of reviewerIds) {
      await this.notificationsService.queueNotification({
        userId: reviewerId,
        type: 'PROJECT_UPDATED',
        channel: 'BOTH',
        data: {
          projectName,
          deliverableTitle: submission.deliverable.title,
          feedback: `${submitterName} made a new submission to ${submission.deliverable.title}.`,
          targetPath: '/slides',
        },
      });
    }

    if (options?.isLate && submitter?.role === 'CONSULTANT') {
      await this.notificationsService.queueNotification({
        userId: projectPmId,
        type: 'OVERDUE_ALERT',
        channel: 'BOTH',
        data: {
          projectName,
          deliverableTitle: submission.deliverable.title,
          submitterName,
          submittedAt: options.submittedAt,
          deadline: options.deadline,
          isLate: true,
          lateByMinutes:
            options.deadline && options.submittedAt
              ? this.getLateByMinutes(options.deadline, options.submittedAt)
              : 0,
          feedback: `${submitterName} submitted ${submission.deliverable.title} after the deadline.`,
          targetPath: '/slides',
        },
      });
    }
  }

  async getMySubmissions(userId: string) {
    return this.prisma.submission.findMany({
      where: { userId },
      orderBy: { submittedAt: 'desc' },
      include: {
        submitter: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        deliverable: {
          select: {
            id: true,
            title: true,
            project: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async getAllSubmissions() {
    return this.prisma.submission.findMany({
      orderBy: { submittedAt: 'desc' },
      include: {
        submitter: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        deliverable: {
          select: {
            id: true,
            title: true,
            project: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async markAsCommented(
    submissionId: string,
    userId: string,
    userRole: 'PM' | 'LC' | 'PARTNER' | 'EXECUTIVE' | 'ADMIN',
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        submitter: {
          select: {
            id: true,
          },
        },
        deliverable: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const commenter = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    if (!commenter) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        reviewedById: userId,
        reviewedAt: new Date(),
      },
      include: {
        submitter: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    const commenterName = this.getDisplayName(
      commenter.firstName,
      commenter.lastName,
      commenter.email,
    );

    await this.notifyAssignmentAssignees(submission.deliverable.id, {
      deliverableTitle: submission.deliverable.title,
      feedback: `${commenterName} added comments to ${submission.deliverable.title}.`,
    });
    await this.notifySubmitterOfReviewAction({
      submitterId: submission.submitter.id,
      type: 'PROJECT_UPDATED',
      deliverableTitle: submission.deliverable.title,
      feedback: `${commenterName} added comments to your submission for ${submission.deliverable.title}.`,
    });

    return updated;
  }

  async approveSubmission(
    submissionId: string,
    reviewerId: string,
    reviewerRole: 'PM' | 'LC' | 'ADMIN',
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        submitter: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const reviewer = await this.prisma.user.findUnique({
      where: { id: reviewerId },
      select: { firstName: true, lastName: true, email: true },
    });
    if (!reviewer) {
      throw new NotFoundException('Reviewer not found');
    }

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: 'APPROVED',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
      include: {
        submitter: true,
        reviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        deliverable: true,
      },
    });

    await this.prisma.deliverable.update({
      where: { id: updated.deliverable.id },
      data: { status: 'APPROVED' },
    });

    await this.markLinkedSlideTaskApproved(updated.deliverable.id);

    const reviewerName = this.getDisplayName(
      reviewer.firstName,
      reviewer.lastName,
      reviewer.email,
    );

    await this.notifyAssignmentAssignees(updated.deliverable.id, {
      deliverableTitle: updated.deliverable.title,
      feedback: `${reviewerName} approved ${updated.deliverable.title}.`,
    });
    await this.notifySubmitterOfReviewAction({
      submitterId: updated.submitter.id,
      type: 'SUBMISSION_APPROVED',
      deliverableTitle: updated.deliverable.title,
      feedback: `${reviewerName} approved your submission.`,
    });

    return updated;
  }

  async requestRevision(
    submissionId: string,
    reviewerId: string,
    reviewerRole: 'PM' | 'LC' | 'ADMIN',
    feedback?: string,
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        submitter: {
          select: {
            id: true,
          },
        },
        deliverable: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const reviewer = await this.prisma.user.findUnique({
      where: { id: reviewerId },
      select: { firstName: true, lastName: true, email: true },
    });
    if (!reviewer) {
      throw new NotFoundException('Reviewer not found');
    }

    const normalizedFeedback = feedback?.trim() || null;

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: 'REQUIRES_RESUBMISSION',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        feedback: normalizedFeedback,
      },
      include: {
        submitter: true,
        reviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        deliverable: true,
      },
    });

    await this.markLinkedSlideTaskRevisionRequested(submission.deliverable.id);

    const reviewerName = this.getDisplayName(
      reviewer.firstName,
      reviewer.lastName,
      reviewer.email,
    );
    const feedbackSuffix = normalizedFeedback ? ` ${normalizedFeedback}` : '';

    await this.notifyAssignmentAssignees(submission.deliverable.id, {
      deliverableTitle: submission.deliverable.title,
      feedback: `${reviewerName} requested a revision on ${submission.deliverable.title}.${feedbackSuffix}`,
    });
    await this.notifySubmitterOfReviewAction({
      submitterId: updated.submitter.id,
      type: 'SUBMISSION_REJECTED',
      deliverableTitle: updated.deliverable.title,
      feedback: normalizedFeedback
        ? `${reviewerName} requested revisions: ${normalizedFeedback}`
        : `${reviewerName} requested revisions on your submission.`,
    });

    return updated;
  }

  private async notifySubmitterOfReviewAction(payload: {
    submitterId: string;
    type: 'PROJECT_UPDATED' | 'SUBMISSION_APPROVED' | 'SUBMISSION_REJECTED';
    deliverableTitle: string;
    feedback?: string | null;
  }): Promise<void> {
    await this.notificationsService.queueNotification({
      userId: payload.submitterId,
      type: payload.type,
      channel: 'BOTH',
      data: {
        deliverableTitle: payload.deliverableTitle,
        feedback: payload.feedback || undefined,
        targetPath: '/slides',
      },
    });
  }

  async getSubmissionsByTask(taskId: string) {
    return this.prisma.submission.findMany({
      where: { deliverableId: taskId },
      orderBy: { version: 'desc' },
      include: {
        submitter: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        deliverable: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
  }

  private async markLinkedSlideTaskApproved(deliverableId: string): Promise<void> {
    const marker = `${SlideSubmissionsService.SLIDE_TASK_MARKER_PREFIX}${deliverableId}]]`;
    const linkedTask = await this.prisma.task.findFirst({
      where: {
        description: {
          contains: marker,
        },
      },
      select: { id: true },
    });

    if (!linkedTask) return;

    await this.prisma.task.update({
      where: { id: linkedTask.id },
      data: {
        status: 'COMPLETED',
        completed: true,
      },
    });
  }

  private async markLinkedSlideTaskRevisionRequested(deliverableId: string): Promise<void> {
    const marker = `${SlideSubmissionsService.SLIDE_TASK_MARKER_PREFIX}${deliverableId}]]`;
    const linkedTask = await this.prisma.task.findFirst({
      where: {
        description: {
          contains: marker,
        },
      },
      select: { id: true },
    });

    if (!linkedTask) return;

    await this.prisma.task.update({
      where: { id: linkedTask.id },
      data: {
        status: 'IN_PROGRESS',
        completed: false,
      },
    });
  }

  private async notifyAssignmentAssignees(
    deliverableId: string,
    payload: { deliverableTitle?: string; feedback: string },
  ): Promise<void> {
    const assigneeIds = await this.getAssigneeUserIdsByDeliverableId(deliverableId);
    for (const userId of assigneeIds) {
      await this.notificationsService.queueNotification({
        userId,
        type: 'PROJECT_UPDATED',
        channel: 'BOTH',
        data: {
          deliverableTitle: payload.deliverableTitle,
          feedback: payload.feedback,
          targetPath: '/slides',
        },
      });
    }
  }

  private async getAssigneeUserIdsByDeliverableId(deliverableId: string): Promise<string[]> {
    const marker = `${SlideSubmissionsService.SLIDE_TASK_MARKER_PREFIX}${deliverableId}]]`;
    const task = await this.prisma.task.findFirst({
      where: {
        description: {
          contains: marker,
        },
      },
      select: {
        assigneeType: true,
        assigneeEmail: true,
        projectId: true,
      },
    });

    if (!task) return [];

    if (task.assigneeType === 'PERSON' && task.assigneeEmail) {
      const person = await this.prisma.user.findFirst({
        where: {
          email: {
            equals: task.assigneeEmail,
            mode: 'insensitive',
          },
          active: true,
        },
        select: { id: true },
      });
      return person ? [person.id] : [];
    }

    if (task.assigneeType === 'ALL_TEAM' && task.projectId) {
      const members = await this.prisma.projectMember.findMany({
        where: { projectId: task.projectId, leftAt: null },
        select: { userId: true },
      });
      return [...new Set(members.map((member) => member.userId))];
    }

    if (task.assigneeType === 'ALL_PMS') {
      const pms = await this.prisma.user.findMany({
        where: { active: true, OR: [{ role: 'PM' }, { role: 'ADMIN' }] },
        select: { id: true },
      });
      return pms.map((pm) => pm.id);
    }

    if (task.assigneeType === 'ALL') {
      const users = await this.prisma.user.findMany({
        where: { active: true },
        select: { id: true },
      });
      return users.map((user) => user.id);
    }

    return [];
  }
}
