-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";

-- AlterTable
ALTER TABLE "app_tutor"."InteractiveSpecEmbedding" ADD COLUMN "vector" public.vector(1536);

-- AlterTable
ALTER TABLE "app_tutor"."KnowledgeEmbedding" ADD COLUMN "vector" public.vector(1536);

-- AlterTable
ALTER TABLE "app_tutor"."LessonEmbedding" ADD COLUMN "vector" public.vector(1536);

-- AlterTable
ALTER TABLE "app_tutor"."McqEmbedding" ADD COLUMN "vector" public.vector(1536);
