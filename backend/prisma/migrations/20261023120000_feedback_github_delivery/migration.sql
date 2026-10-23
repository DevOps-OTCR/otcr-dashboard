CREATE TABLE "FeedbackGithubDelivery" (
    "id" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "issueNumber" INTEGER,
    "issueUrl" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createStartedAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackGithubDelivery_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeedbackGithubDelivery_id_fkey" FOREIGN KEY ("id")
      REFERENCES "FeedbackSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "FeedbackGithubDelivery_status_nextAttemptAt_idx"
  ON "FeedbackGithubDelivery"("status", "nextAttemptAt");
