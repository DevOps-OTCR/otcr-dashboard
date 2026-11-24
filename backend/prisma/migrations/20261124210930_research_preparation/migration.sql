-- CreateEnum
CREATE TYPE "ResearchPreparationStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "ResearchPreparation" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "status" "ResearchPreparationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchPreparation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResearchPreparation_deliverableId_key" ON "ResearchPreparation"("deliverableId");

-- AddForeignKey
ALTER TABLE "ResearchPreparation" ADD CONSTRAINT "ResearchPreparation_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
