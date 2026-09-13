-- No accounts configured reads exactly like a user who has never opened the
-- socials widget, so existing rows need no backfill.
ALTER TABLE "User" ADD COLUMN "socialsConfig" JSONB;
