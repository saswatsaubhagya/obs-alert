-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Overlay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Overlay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventType" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fields" JSONB NOT NULL,

    CONSTRAINT "EventType_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AlertConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventTypeKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "template" TEXT NOT NULL,
    "titleTemplate" TEXT,
    "style" JSONB NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 5000,
    "imageUrl" TEXT,
    "soundUrl" TEXT,
    "soundVolume" INTEGER NOT NULL DEFAULT 80,
    "minAmount" INTEGER,
    "locale" TEXT NOT NULL DEFAULT 'en-US',

    CONSTRAINT "AlertConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventTypeKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "renderedText" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "deliveredTo" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Overlay_token_key" ON "Overlay"("token");

-- CreateIndex
CREATE UNIQUE INDEX "IngestKey_hash_key" ON "IngestKey"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "AlertConfig_userId_eventTypeKey_key" ON "AlertConfig"("userId", "eventTypeKey");

-- CreateIndex
CREATE INDEX "AlertLog_userId_createdAt_idx" ON "AlertLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AlertLog_createdAt_idx" ON "AlertLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Overlay" ADD CONSTRAINT "Overlay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestKey" ADD CONSTRAINT "IngestKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertConfig" ADD CONSTRAINT "AlertConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertLog" ADD CONSTRAINT "AlertLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

