-- A stopped timer: no end instant and nothing left on the clock. Existing rows
-- read exactly like a user who has never started one, so no backfill.
ALTER TABLE "User" ADD COLUMN "timerEndsAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "timerRemainingMs" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "timerConfig" JSONB;
