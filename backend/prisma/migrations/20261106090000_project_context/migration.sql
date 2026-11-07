ALTER TABLE "Project" ADD COLUMN "overview" TEXT;
ALTER TABLE "Project" ADD COLUMN "scope" TEXT;

CREATE TABLE "ProjectContextNote" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectContextNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectContextNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProjectContextNote_projectId_createdAt_idx" ON "ProjectContextNote"("projectId", "createdAt");
