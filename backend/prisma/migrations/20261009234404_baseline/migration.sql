-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PM', 'LC', 'PARTNER', 'EXECUTIVE', 'CONSULTANT');

-- CreateEnum
CREATE TYPE "OnboardingRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "AttendanceLocationType" AS ENUM ('IN_PERSON', 'ONLINE');

-- CreateEnum
CREATE TYPE "AttendanceAudienceScope" AS ENUM ('TEAM', 'GLOBAL');

-- CreateEnum
CREATE TYPE "AttendanceVerificationMethod" AS ENUM ('GEOFENCE', 'CODE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'OVERDUE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TaskAssigneeType" AS ENUM ('PERSON', 'ALL', 'ALL_PMS', 'ALL_TEAM');

-- CreateEnum
CREATE TYPE "SprintStatus" AS ENUM ('DRAFT', 'RELEASED');

-- CreateEnum
CREATE TYPE "DeliverableType" AS ENUM ('DOCUMENT', 'PRESENTATION', 'CODE', 'ANALYSIS', 'REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "DeliverableTemplateKind" AS ENUM ('INITIAL_SLIDES', 'FINAL_SLIDES', 'INITIAL_WHITEPAPER', 'FINAL_WHITEPAPER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DueDateSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REQUIRES_RESUBMISSION');

-- CreateEnum
CREATE TYPE "ExtensionStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DEADLINE_REMINDER', 'DEADLINE_24H', 'DEADLINE_1H', 'EXTENSION_REQUEST', 'EXTENSION_APPROVED', 'EXTENSION_DENIED', 'SUBMISSION_APPROVED', 'SUBMISSION_REJECTED', 'PROJECT_ASSIGNED', 'PROJECT_UPDATED', 'OVERDUE_ALERT');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SLACK', 'EMAIL', 'BOTH');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "SlackOAuthPurpose" AS ENUM ('INSTALL', 'CONNECT');

-- CreateTable
CREATE TABLE "applications" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "interest" VARCHAR(500),
    "resume_filename" VARCHAR(255),
    "resume_path" VARCHAR(500),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(6),
    "notes" TEXT,
    "archived_at" TIMESTAMP(6),
    "assessment_link_id" INTEGER,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_links" (
    "id" SERIAL NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "email" VARCHAR(255),
    "label" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(6),

    CONSTRAINT "assessment_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_progress_snapshots" (
    "id" SERIAL NOT NULL,
    "attempt_id" INTEGER NOT NULL,
    "snapshot_at" TIMESTAMP(6) NOT NULL,
    "sections_completed" JSON,
    "current_section" VARCHAR(50),
    "elapsed_seconds" INTEGER NOT NULL,
    "progress_detail" JSONB,

    CONSTRAINT "assessment_progress_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" SERIAL NOT NULL,
    "link_id" INTEGER NOT NULL,
    "started_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(6),
    "sections_completed" JSONB DEFAULT '[]',
    "focus_loss_events" INTEGER DEFAULT 0,
    "is_flagged" BOOLEAN DEFAULT false,
    "integrity_notes" VARCHAR(500),

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" SERIAL NOT NULL,
    "attempt_id" INTEGER NOT NULL,
    "section" VARCHAR(50) NOT NULL,
    "payload" JSONB NOT NULL,
    "coding_result" JSONB,
    "notes" VARCHAR(500),
    "submitted_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "googleId" TEXT,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CONSULTANT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "requestedRole" "Role" NOT NULL,
    "status" "OnboardingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewerNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackSubmission" (
    "id" TEXT NOT NULL,
    "formType" TEXT NOT NULL DEFAULT 'DASHBOARD_FEEDBACK',
    "problem" TEXT,
    "description" TEXT NOT NULL,
    "urgency" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "submitterId" TEXT,
    "submitterEmail" TEXT,
    "submitterName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllowedEmail" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllowedEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "clientName" TEXT,
    "googleCalendarId" TEXT,
    "pmId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "sprintStartDay" "Weekday" NOT NULL DEFAULT 'MONDAY',
    "initialSlideDueDay" "Weekday" NOT NULL DEFAULT 'TUESDAY',
    "finalSlideDueDay" "Weekday" NOT NULL DEFAULT 'THURSDAY',
    "defaultDueTime" TEXT NOT NULL DEFAULT '23:59',
    "sprintTimezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "autoGenerateSprints" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "locationType" "AttendanceLocationType" NOT NULL,
    "locationLabel" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geofenceRadiusMeters" INTEGER NOT NULL DEFAULT 150,
    "audienceScope" "AttendanceAudienceScope" NOT NULL DEFAULT 'TEAM',
    "projectId" TEXT,
    "createdById" TEXT NOT NULL,
    "verificationCode" TEXT,
    "codeWindowOpensAt" TIMESTAMP(3),
    "codeWindowClosesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceCheckIn" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "verificationMethod" "AttendanceVerificationMethod" NOT NULL,
    "codeVerified" BOOLEAN NOT NULL DEFAULT false,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceEventCategorySetting" (
    "eventId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceEventCategorySetting_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "AttendanceEventCalendarSync" (
    "eventId" TEXT NOT NULL,
    "googleCalendarId" TEXT NOT NULL,
    "googleCalendarEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceEventCalendarSync_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "AttendanceEventAvailabilityPoll" (
    "eventId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceEventAvailabilityPoll_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "AttendanceEventAvailabilitySelection" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slotStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceEventAvailabilitySelection_pkey" PRIMARY KEY ("eventId","userId","slotStart")
);

-- CreateTable
CREATE TABLE "When2MeetPoll" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "gridFirstDate" DATE,
    "gridLastDate" DATE,
    "slotStartMinute" INTEGER NOT NULL DEFAULT 540,
    "slotEndMinute" INTEGER NOT NULL DEFAULT 1020,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "When2MeetPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "When2MeetAvailability" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "When2MeetAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCalendarSetting" (
    "projectId" TEXT NOT NULL,
    "googleCalendarEmbedUrl" TEXT,
    "googleCalendarId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCalendarSetting_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "taskName" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "projectName" TEXT NOT NULL,
    "workstream" TEXT NOT NULL,
    "workstreamId" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "assigneeType" "TaskAssigneeType" NOT NULL,
    "assigneeEmail" TEXT,
    "projectId" TEXT,
    "googleCalendarEventId" TEXT,
    "googleCalendarId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sprintId" TEXT,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "DeliverableType" NOT NULL,
    "templateKind" "DeliverableTemplateKind" NOT NULL DEFAULT 'CUSTOM',
    "deadline" TIMESTAMP(3) NOT NULL,
    "dueDateSource" "DueDateSource" NOT NULL DEFAULT 'AUTO',
    "manualDeadlineUpdatedAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverableSubtask" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueDate" TIMESTAMP(3),
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliverableSubtask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverableAssignment" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliverableAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sprint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "weekEndDate" TIMESTAMP(3) NOT NULL,
    "status" "SprintStatus" NOT NULL DEFAULT 'DRAFT',
    "configSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "feedback" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "replacesId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isLate" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Extension" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "originalDueDate" TIMESTAMP(3) NOT NULL,
    "requestedDueDate" TIMESTAMP(3) NOT NULL,
    "status" "ExtensionStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approverNotes" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "Extension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackWorkspace" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT,
    "enterpriseId" TEXT,
    "botAccessToken" TEXT NOT NULL,
    "installedByUserId" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackOAuthState" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "SlackOAuthPurpose" NOT NULL,
    "workspaceId" TEXT,
    "redirectUri" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlackOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackUserConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slackUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackUserConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE INDEX "ix_applications_assessment_link_id" ON "applications"("assessment_link_id");

-- CreateIndex
CREATE INDEX "ix_applications_email" ON "applications"("email");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_links_token_key" ON "assessment_links"("token");

-- CreateIndex
CREATE INDEX "ix_assessment_links_email" ON "assessment_links"("email");

-- CreateIndex
CREATE INDEX "ix_assessment_links_token" ON "assessment_links"("token");

-- CreateIndex
CREATE INDEX "ix_assessment_progress_snapshots_attempt_id" ON "assessment_progress_snapshots"("attempt_id");

-- CreateIndex
CREATE INDEX "ix_assessment_progress_snapshots_id" ON "assessment_progress_snapshots"("id");

-- CreateIndex
CREATE INDEX "ix_attempts_link_id" ON "attempts"("link_id");

-- CreateIndex
CREATE INDEX "ix_submissions_attempt_id" ON "submissions"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_googleId_idx" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingRequest_email_key" ON "OnboardingRequest"("email");

-- CreateIndex
CREATE INDEX "OnboardingRequest_status_idx" ON "OnboardingRequest"("status");

-- CreateIndex
CREATE INDEX "OnboardingRequest_email_idx" ON "OnboardingRequest"("email");

-- CreateIndex
CREATE INDEX "OnboardingRequest_createdAt_idx" ON "OnboardingRequest"("createdAt");

-- CreateIndex
CREATE INDEX "FeedbackSubmission_submitterId_idx" ON "FeedbackSubmission"("submitterId");

-- CreateIndex
CREATE INDEX "FeedbackSubmission_createdAt_idx" ON "FeedbackSubmission"("createdAt");

-- CreateIndex
CREATE INDEX "FeedbackSubmission_formType_createdAt_idx" ON "FeedbackSubmission"("formType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AllowedEmail_email_key" ON "AllowedEmail"("email");

-- CreateIndex
CREATE INDEX "AllowedEmail_email_idx" ON "AllowedEmail"("email");

-- CreateIndex
CREATE INDEX "AllowedEmail_active_idx" ON "AllowedEmail"("active");

-- CreateIndex
CREATE INDEX "Project_pmId_idx" ON "Project"("pmId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_startDate_idx" ON "Project"("startDate");

-- CreateIndex
CREATE INDEX "ProjectMember_projectId_idx" ON "ProjectMember"("projectId");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE INDEX "AttendanceEvent_eventDate_idx" ON "AttendanceEvent"("eventDate");

-- CreateIndex
CREATE INDEX "AttendanceEvent_projectId_idx" ON "AttendanceEvent"("projectId");

-- CreateIndex
CREATE INDEX "AttendanceEvent_createdById_idx" ON "AttendanceEvent"("createdById");

-- CreateIndex
CREATE INDEX "AttendanceEvent_audienceScope_idx" ON "AttendanceEvent"("audienceScope");

-- CreateIndex
CREATE INDEX "AttendanceCheckIn_eventId_idx" ON "AttendanceCheckIn"("eventId");

-- CreateIndex
CREATE INDEX "AttendanceCheckIn_userId_idx" ON "AttendanceCheckIn"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceCheckIn_eventId_userId_key" ON "AttendanceCheckIn"("eventId", "userId");

-- CreateIndex
CREATE INDEX "AttendanceEventAvailabilitySelection_eventId_idx" ON "AttendanceEventAvailabilitySelection"("eventId");

-- CreateIndex
CREATE INDEX "AttendanceEventAvailabilitySelection_userId_idx" ON "AttendanceEventAvailabilitySelection"("userId");

-- CreateIndex
CREATE INDEX "When2MeetPoll_projectId_idx" ON "When2MeetPoll"("projectId");

-- CreateIndex
CREATE INDEX "When2MeetPoll_createdById_idx" ON "When2MeetPoll"("createdById");

-- CreateIndex
CREATE INDEX "When2MeetAvailability_pollId_idx" ON "When2MeetAvailability"("pollId");

-- CreateIndex
CREATE INDEX "When2MeetAvailability_userId_idx" ON "When2MeetAvailability"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "When2MeetAvailability_pollId_userId_slotIndex_key" ON "When2MeetAvailability"("pollId", "userId", "slotIndex");

-- CreateIndex
CREATE INDEX "Task_createdById_idx" ON "Task"("createdById");

-- CreateIndex
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");

-- CreateIndex
CREATE INDEX "Task_assigneeType_idx" ON "Task"("assigneeType");

-- CreateIndex
CREATE INDEX "Task_workstreamId_idx" ON "Task"("workstreamId");

-- CreateIndex
CREATE INDEX "Deliverable_projectId_idx" ON "Deliverable"("projectId");

-- CreateIndex
CREATE INDEX "Deliverable_sprintId_idx" ON "Deliverable"("sprintId");

-- CreateIndex
CREATE INDEX "Deliverable_assigneeId_idx" ON "Deliverable"("assigneeId");

-- CreateIndex
CREATE INDEX "Deliverable_deadline_idx" ON "Deliverable"("deadline");

-- CreateIndex
CREATE INDEX "Deliverable_status_idx" ON "Deliverable"("status");

-- CreateIndex
CREATE INDEX "DeliverableSubtask_deliverableId_idx" ON "DeliverableSubtask"("deliverableId");

-- CreateIndex
CREATE INDEX "DeliverableSubtask_assigneeId_idx" ON "DeliverableSubtask"("assigneeId");

-- CreateIndex
CREATE INDEX "DeliverableSubtask_dueDate_idx" ON "DeliverableSubtask"("dueDate");

-- CreateIndex
CREATE INDEX "DeliverableAssignment_deliverableId_idx" ON "DeliverableAssignment"("deliverableId");

-- CreateIndex
CREATE INDEX "DeliverableAssignment_userId_idx" ON "DeliverableAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverableAssignment_deliverableId_userId_key" ON "DeliverableAssignment"("deliverableId", "userId");

-- CreateIndex
CREATE INDEX "Sprint_projectId_idx" ON "Sprint"("projectId");

-- CreateIndex
CREATE INDEX "Sprint_weekStartDate_idx" ON "Sprint"("weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "Sprint_projectId_sequenceNumber_key" ON "Sprint"("projectId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "Submission_deliverableId_idx" ON "Submission"("deliverableId");

-- CreateIndex
CREATE INDEX "Submission_userId_idx" ON "Submission"("userId");

-- CreateIndex
CREATE INDEX "Submission_status_idx" ON "Submission"("status");

-- CreateIndex
CREATE INDEX "Extension_deliverableId_idx" ON "Extension"("deliverableId");

-- CreateIndex
CREATE INDEX "Extension_requestedById_idx" ON "Extension"("requestedById");

-- CreateIndex
CREATE INDEX "Extension_status_idx" ON "Extension"("status");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_idx" ON "TimeEntry"("userId");

-- CreateIndex
CREATE INDEX "TimeEntry_date_idx" ON "TimeEntry"("date");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE UNIQUE INDEX "SlackWorkspace_teamId_key" ON "SlackWorkspace"("teamId");

-- CreateIndex
CREATE INDEX "SlackWorkspace_installedByUserId_idx" ON "SlackWorkspace"("installedByUserId");

-- CreateIndex
CREATE INDEX "SlackWorkspace_enterpriseId_idx" ON "SlackWorkspace"("enterpriseId");

-- CreateIndex
CREATE UNIQUE INDEX "SlackOAuthState_state_key" ON "SlackOAuthState"("state");

-- CreateIndex
CREATE INDEX "SlackOAuthState_userId_idx" ON "SlackOAuthState"("userId");

-- CreateIndex
CREATE INDEX "SlackOAuthState_workspaceId_idx" ON "SlackOAuthState"("workspaceId");

-- CreateIndex
CREATE INDEX "SlackOAuthState_expiresAt_idx" ON "SlackOAuthState"("expiresAt");

-- CreateIndex
CREATE INDEX "SlackUserConnection_workspaceId_idx" ON "SlackUserConnection"("workspaceId");

-- CreateIndex
CREATE INDEX "SlackUserConnection_slackUserId_idx" ON "SlackUserConnection"("slackUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SlackUserConnection_userId_workspaceId_key" ON "SlackUserConnection"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_assessment_link_id_fkey" FOREIGN KEY ("assessment_link_id") REFERENCES "assessment_links"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assessment_progress_snapshots" ADD CONSTRAINT "assessment_progress_snapshots_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "assessment_links"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OnboardingRequest" ADD CONSTRAINT "OnboardingRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackSubmission" ADD CONSTRAINT "FeedbackSubmission_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_pmId_fkey" FOREIGN KEY ("pmId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCheckIn" ADD CONSTRAINT "AttendanceCheckIn_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AttendanceEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCheckIn" ADD CONSTRAINT "AttendanceCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEventCategorySetting" ADD CONSTRAINT "AttendanceEventCategorySetting_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AttendanceEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEventCalendarSync" ADD CONSTRAINT "AttendanceEventCalendarSync_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AttendanceEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEventAvailabilityPoll" ADD CONSTRAINT "AttendanceEventAvailabilityPoll_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AttendanceEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEventAvailabilitySelection" ADD CONSTRAINT "AttendanceEventAvailabilitySelection_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AttendanceEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEventAvailabilitySelection" ADD CONSTRAINT "AttendanceEventAvailabilitySelection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "When2MeetPoll" ADD CONSTRAINT "When2MeetPoll_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "When2MeetPoll" ADD CONSTRAINT "When2MeetPoll_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "When2MeetAvailability" ADD CONSTRAINT "When2MeetAvailability_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "When2MeetPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "When2MeetAvailability" ADD CONSTRAINT "When2MeetAvailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCalendarSetting" ADD CONSTRAINT "ProjectCalendarSetting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableSubtask" ADD CONSTRAINT "DeliverableSubtask_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableSubtask" ADD CONSTRAINT "DeliverableSubtask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableAssignment" ADD CONSTRAINT "DeliverableAssignment_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableAssignment" ADD CONSTRAINT "DeliverableAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Extension" ADD CONSTRAINT "Extension_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Extension" ADD CONSTRAINT "Extension_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Extension" ADD CONSTRAINT "Extension_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackWorkspace" ADD CONSTRAINT "SlackWorkspace_installedByUserId_fkey" FOREIGN KEY ("installedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackOAuthState" ADD CONSTRAINT "SlackOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackOAuthState" ADD CONSTRAINT "SlackOAuthState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "SlackWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackUserConnection" ADD CONSTRAINT "SlackUserConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackUserConnection" ADD CONSTRAINT "SlackUserConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "SlackWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
