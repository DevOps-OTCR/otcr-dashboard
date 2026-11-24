-- CreateEnum
CREATE TYPE "ResearchRevisionAction" AS ENUM ('INITIALIZE', 'EDIT', 'RESTORE');

-- CreateTable
CREATE TABLE "ResearchWorkspace" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "document" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchRevision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "document" JSONB NOT NULL,
    "action" "ResearchRevisionAction" NOT NULL,
    "restoredFromVersion" INTEGER,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResearchWorkspace_deliverableId_key" ON "ResearchWorkspace"("deliverableId");

-- CreateIndex
CREATE INDEX "ResearchRevision_authorId_idx" ON "ResearchRevision"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchRevision_workspaceId_version_key" ON "ResearchRevision"("workspaceId", "version");

-- AddForeignKey
ALTER TABLE "ResearchWorkspace" ADD CONSTRAINT "ResearchWorkspace_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRevision" ADD CONSTRAINT "ResearchRevision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ResearchWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRevision" ADD CONSTRAINT "ResearchRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
