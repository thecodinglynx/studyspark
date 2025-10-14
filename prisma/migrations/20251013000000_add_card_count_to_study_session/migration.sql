-- Add cardCount column to StudySession to track how many cards were practiced during a run
ALTER TABLE "StudySession" ADD COLUMN "cardCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing sessions with the total number of answers recorded
UPDATE "StudySession"
SET "cardCount" = COALESCE("correct", 0) + COALESCE("incorrect", 0);
