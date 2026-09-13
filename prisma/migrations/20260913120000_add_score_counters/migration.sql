-- Both counters default to 0, so existing rows need no backfill.
ALTER TABLE "User" ADD COLUMN "wins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "losses" INTEGER NOT NULL DEFAULT 0;
