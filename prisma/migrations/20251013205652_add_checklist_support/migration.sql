-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('FLASHCARDS', 'CHECKLIST');

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "type" "SubjectType" NOT NULL DEFAULT 'FLASHCARDS';

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistEntry" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "practicedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistItem_subjectId_position_idx" ON "ChecklistItem"("subjectId", "position");

-- CreateIndex
CREATE INDEX "ChecklistEntry_subjectId_userId_practicedAt_idx" ON "ChecklistEntry"("subjectId", "userId", "practicedAt");

-- CreateIndex
CREATE INDEX "ChecklistEntry_itemId_practicedAt_idx" ON "ChecklistEntry"("itemId", "practicedAt");

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistEntry" ADD CONSTRAINT "ChecklistEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistEntry" ADD CONSTRAINT "ChecklistEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistEntry" ADD CONSTRAINT "ChecklistEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
