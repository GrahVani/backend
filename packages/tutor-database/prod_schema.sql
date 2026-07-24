-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app_tutor";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";

-- CreateEnum
CREATE TYPE "app_tutor"."TutorSessionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "app_tutor"."TutorMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateTable
CREATE TABLE "app_tutor"."TutorSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonSlug" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" "app_tutor"."TutorSessionStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TutorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_tutor"."TutorMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "clientMessageId" TEXT NOT NULL,
    "role" "app_tutor"."TutorMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "intent" TEXT,
    "promptVersion" TEXT,
    "model" TEXT,
    "tokenUsageInput" INTEGER,
    "tokenUsageOutput" INTEGER,
    "latencyMs" INTEGER,
    "retrievedChunkIds" TEXT[],
    "feedbackRating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TutorMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_tutor"."TutorFeedback" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_tutor"."TutorMessageFlag" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "flaggedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorMessageFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_tutor"."PromptTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercentage" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_tutor"."LessonEmbedding" (
    "id" TEXT NOT NULL,
    "lessonSlug" TEXT NOT NULL,
    "sectionNumber" INTEGER NOT NULL,
    "chunkHash" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "vector" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_tutor"."McqEmbedding" (
    "id" TEXT NOT NULL,
    "lessonSlug" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "chunkHash" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "vector" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McqEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_tutor"."KnowledgeEmbedding" (
    "id" TEXT NOT NULL,
    "termKey" TEXT NOT NULL,
    "chunkHash" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "vector" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_tutor"."InteractiveSpecEmbedding" (
    "id" TEXT NOT NULL,
    "componentType" TEXT NOT NULL,
    "chunkHash" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "vector" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteractiveSpecEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_tutor"."TutorUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "messageId" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_tutor"."LearnerTutorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weakConcepts" TEXT[],
    "strongConcepts" TEXT[],
    "askedConcepts" TEXT[],
    "preferredExplanationStyle" TEXT,
    "preferredLanguage" TEXT,
    "summary" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnerTutorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TutorSession_userId_lastMessageAt_idx" ON "app_tutor"."TutorSession"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "TutorSession_deletedAt_idx" ON "app_tutor"."TutorSession"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TutorMessage_clientMessageId_key" ON "app_tutor"."TutorMessage"("clientMessageId");

-- CreateIndex
CREATE INDEX "TutorMessage_sessionId_createdAt_idx" ON "app_tutor"."TutorMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "TutorMessage_deletedAt_idx" ON "app_tutor"."TutorMessage"("deletedAt");

-- CreateIndex
CREATE INDEX "TutorMessageFlag_messageId_idx" ON "app_tutor"."TutorMessageFlag"("messageId");

-- CreateIndex
CREATE INDEX "TutorMessageFlag_flaggedBy_idx" ON "app_tutor"."TutorMessageFlag"("flaggedBy");

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_name_version_key" ON "app_tutor"."PromptTemplate"("name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "LessonEmbedding_chunkHash_key" ON "app_tutor"."LessonEmbedding"("chunkHash");

-- CreateIndex
CREATE INDEX "LessonEmbedding_lessonSlug_sectionNumber_idx" ON "app_tutor"."LessonEmbedding"("lessonSlug", "sectionNumber");

-- CreateIndex
CREATE INDEX "LessonEmbedding_chunkHash_idx" ON "app_tutor"."LessonEmbedding"("chunkHash");

-- CreateIndex
CREATE UNIQUE INDEX "McqEmbedding_chunkHash_key" ON "app_tutor"."McqEmbedding"("chunkHash");

-- CreateIndex
CREATE INDEX "McqEmbedding_lessonSlug_questionId_idx" ON "app_tutor"."McqEmbedding"("lessonSlug", "questionId");

-- CreateIndex
CREATE INDEX "McqEmbedding_chunkHash_idx" ON "app_tutor"."McqEmbedding"("chunkHash");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeEmbedding_chunkHash_key" ON "app_tutor"."KnowledgeEmbedding"("chunkHash");

-- CreateIndex
CREATE INDEX "KnowledgeEmbedding_termKey_idx" ON "app_tutor"."KnowledgeEmbedding"("termKey");

-- CreateIndex
CREATE INDEX "KnowledgeEmbedding_chunkHash_idx" ON "app_tutor"."KnowledgeEmbedding"("chunkHash");

-- CreateIndex
CREATE UNIQUE INDEX "InteractiveSpecEmbedding_chunkHash_key" ON "app_tutor"."InteractiveSpecEmbedding"("chunkHash");

-- CreateIndex
CREATE INDEX "InteractiveSpecEmbedding_componentType_idx" ON "app_tutor"."InteractiveSpecEmbedding"("componentType");

-- CreateIndex
CREATE INDEX "InteractiveSpecEmbedding_chunkHash_idx" ON "app_tutor"."InteractiveSpecEmbedding"("chunkHash");

-- CreateIndex
CREATE INDEX "TutorUsageLog_userId_createdAt_idx" ON "app_tutor"."TutorUsageLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TutorUsageLog_createdAt_idx" ON "app_tutor"."TutorUsageLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LearnerTutorProfile_userId_key" ON "app_tutor"."LearnerTutorProfile"("userId");

