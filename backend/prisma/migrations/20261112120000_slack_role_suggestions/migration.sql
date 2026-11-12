
-- CreateEnum
CREATE TYPE "SlackRoleSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "SlackRoleSuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slackUserId" TEXT NOT NULL,
    "slackTitle" TEXT NOT NULL,
    "currentRole" "Role" NOT NULL,
    "suggestedRole" "Role" NOT NULL,
    "status" "SlackRoleSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackRoleSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlackRoleSuggestion_userId_idx" ON "SlackRoleSuggestion"("userId");

-- CreateIndex
CREATE INDEX "SlackRoleSuggestion_status_idx" ON "SlackRoleSuggestion"("status");

-- CreateIndex
CREATE INDEX "SlackRoleSuggestion_reviewedById_idx" ON "SlackRoleSuggestion"("reviewedById");

-- CreateIndex
-- Enforce at most one PENDING suggestion per user (partial unique index).
CREATE UNIQUE INDEX "SlackRoleSuggestion_userId_pending_key" ON "SlackRoleSuggestion"("userId") WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "SlackRoleSuggestion" ADD CONSTRAINT "SlackRoleSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackRoleSuggestion" ADD CONSTRAINT "SlackRoleSuggestion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
