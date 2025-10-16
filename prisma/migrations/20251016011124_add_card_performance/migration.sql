-- CreateTable
CREATE TABLE "CardPerformance" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "incorrectCount" INTEGER NOT NULL DEFAULT 0,
    "lastStudiedAt" TIMESTAMP(3),

    CONSTRAINT "CardPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardPerformance_subjectId_userId_idx" ON "CardPerformance"("subjectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CardPerformance_cardId_userId_key" ON "CardPerformance"("cardId", "userId");

-- AddForeignKey
ALTER TABLE "CardPerformance" ADD CONSTRAINT "CardPerformance_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPerformance" ADD CONSTRAINT "CardPerformance_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPerformance" ADD CONSTRAINT "CardPerformance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
