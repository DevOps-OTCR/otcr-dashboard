-- CreateEnum
CREATE TYPE "ResearchPastDataStatus" AS ENUM ('PENDING', 'RUNNING', 'READY', 'FAILED', 'CONFLICT');

-- CreateTable
CREATE TABLE "ResearchPastData" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "status" "ResearchPastDataStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "focus" TEXT NOT NULL DEFAULT '',
    "baseVersion" INTEGER NOT NULL,
    "requestToken" TEXT NOT NULL,
    "leaseExpiresAt" TIMESTAMP(3),
    "model" TEXT,
    "result" JSONB,
    "errorCode" TEXT,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchPastData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResearchPastData_deliverableId_key" ON "ResearchPastData"("deliverableId");

-- AddForeignKey
ALTER TABLE "ResearchPastData" ADD CONSTRAINT "ResearchPastData_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
