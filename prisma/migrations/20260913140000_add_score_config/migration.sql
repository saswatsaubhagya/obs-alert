-- Nullable: an existing row with no stored config reads as the defaults in
-- src/lib/scoreConfig.ts, so nothing needs backfilling.
ALTER TABLE "User" ADD COLUMN "scoreConfig" JSONB;
