-- CreateEnum

-- CreateTable
CREATE TABLE "DeliverableReminderOverride" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "enabled" BOOLEAN,
    "offsetMinutes" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "explicitRecipientUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliverableReminderOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliverableReminderOverride_deliverableId_key" ON "DeliverableReminderOverride"("deliverableId");

-- CreateIndex
CREATE INDEX "DeliverableReminderOverride_deliverableId_idx" ON "DeliverableReminderOverride"("deliverableId");

-- AddForeignKey
ALTER TABLE "DeliverableReminderOverride" ADD CONSTRAINT "DeliverableReminderOverride_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;