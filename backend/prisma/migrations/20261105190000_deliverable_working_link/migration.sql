-- One live working-file link per deliverable, editable at any time without creating a Submission.
ALTER TABLE "Deliverable" ADD COLUMN "workingLinkUrl" TEXT;
ALTER TABLE "Deliverable" ADD COLUMN "workingLinkUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Deliverable" ADD COLUMN "workingLinkUpdatedById" TEXT;
