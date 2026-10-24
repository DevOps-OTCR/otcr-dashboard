-- CreateEnum
CREATE TYPE "ScheduledReminderStatus" AS ENUM ('PENDING', 'SENT', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "ReminderConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "offsetsMinutes" INTEGER[] DEFAULT ARRAY[1440, 60]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledReminder" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "offsetMinutes" INTEGER NOT NULL,
    "fireAt" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledReminderStatus" NOT NULL DEFAULT 'PENDING',
    "jobId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notificationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReminderConfig_projectId_key" ON "ReminderConfig"("projectId");

-- CreateIndex
CREATE INDEX "ReminderConfig_projectId_idx" ON "ReminderConfig"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledReminder_jobId_key" ON "ScheduledReminder"("jobId");

-- CreateIndex
CREATE INDEX "ScheduledReminder_deliverableId_idx" ON "ScheduledReminder"("deliverableId");

-- CreateIndex
CREATE INDEX "ScheduledReminder_userId_idx" ON "ScheduledReminder"("userId");

-- CreateIndex
CREATE INDEX "ScheduledReminder_status_idx" ON "ScheduledReminder"("status");

-- CreateIndex
CREATE INDEX "ScheduledReminder_fireAt_idx" ON "ScheduledReminder"("fireAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledReminder_deliverableId_userId_offsetMinutes_key" ON "ScheduledReminder"("deliverableId", "userId", "offsetMinutes");

-- AddForeignKey
ALTER TABLE "ReminderConfig" ADD CONSTRAINT "ReminderConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledReminder" ADD CONSTRAINT "ScheduledReminder_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledReminder" ADD CONSTRAINT "ScheduledReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
