-- Add nullable first so existing rows survive the statement.
ALTER TABLE "Overlay" ADD COLUMN "controlToken" TEXT;

-- Backfill every existing row with a distinct value. sha256() and encode()
-- are built into PostgreSQL 13+, so this needs no extension; random() and
-- clock_timestamp() make the digest distinct per row and per run.
UPDATE "Overlay"
SET "controlToken" = encode(sha256(("id" || random()::text || clock_timestamp()::text)::bytea), 'hex')
WHERE "controlToken" IS NULL;

-- Now the constraints can be added safely.
ALTER TABLE "Overlay" ALTER COLUMN "controlToken" SET NOT NULL;
CREATE UNIQUE INDEX "Overlay_controlToken_key" ON "Overlay"("controlToken");
