-- Add reviewer notification tracking without changing existing submission data.
ALTER TABLE "Submission"
ADD COLUMN "reviewerNotificationStatus" "NotificationStatus",
ADD COLUMN "reviewerNotificationAttempts" INTEGER NOT NULL DEFAULT 0;
