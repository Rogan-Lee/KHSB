-- ============================================================================
-- 2026-05-15 prod catch-up: 학생 측 신기능 (영단어 시험 + 학생 질문 게시판)
-- ============================================================================
-- 대상: 프로덕션 DB (ulefrypbhdgbtkjjlnco.supabase.com)
-- 출처: prisma migrate diff (origin/main 의 schema.prisma 기준)
--
-- 적용 방식:
--   1. Supabase Dashboard → SQL Editor 에 이 파일 전체를 붙여넣고 Run
--   2. 또는 psql:  psql "$DATABASE_URL" -1 -f scripts/sql/2026-05-15-prod-catchup.sql
--   3. 또는 prisma:  DIRECT_URL=<prod-5432-pooler> npx prisma db push
--
-- 안전 가드:
--   - 트랜잭션으로 감싸므로 중간 실패 시 전체 롤백 (PostgreSQL DDL 트랜잭셔널)
--   - 사전 가드: StudentQuestion 테이블이 이미 있으면 ROLLBACK (이중 적용 방지)
--   - 모든 변경이 CREATE/ADD CONSTRAINT — 기존 데이터에 변경/삭제 없음
-- ============================================================================

BEGIN;

-- 사전 가드: 이미 적용된 상태면 RAISE EXCEPTION → 트랜잭션 롤백
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'StudentQuestion'
  ) THEN
    RAISE EXCEPTION '이미 적용됨: StudentQuestion 테이블이 존재합니다. 중복 적용 방지를 위해 중단.';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "VocabExamDirection" AS ENUM ('EN_TO_KO', 'KO_TO_EN', 'MIXED');

-- CreateEnum
CREATE TYPE "VocabAttemptStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StudentQuestionStatus" AS ENUM ('OPEN', 'ANSWERED', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionMessageSenderType" AS ENUM ('STUDENT', 'STAFF');

-- CreateTable
CREATE TABLE "VocabBook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabBookEntry" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "meanings" TEXT[],
    "unit" TEXT,
    "partOfSpeech" TEXT,
    "example" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabBookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabExam" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "direction" "VocabExamDirection" NOT NULL DEFAULT 'EN_TO_KO',
    "questionCount" INTEGER NOT NULL,
    "perQuestionSeconds" INTEGER NOT NULL DEFAULT 10,
    "units" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "entryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shuffle" BOOLEAN NOT NULL DEFAULT true,
    "retakeOfId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabExam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabAttempt" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "VocabAttemptStatus" NOT NULL DEFAULT 'ASSIGNED',
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,

    CONSTRAINT "VocabAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabAttemptItem" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "direction" "VocabExamDirection" NOT NULL,
    "prompt" TEXT NOT NULL,
    "expectedAnswers" TEXT[],
    "word" TEXT NOT NULL,
    "meanings" TEXT[],
    "studentAnswer" TEXT,
    "isCorrect" BOOLEAN,
    "timeMs" INTEGER,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "VocabAttemptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentQuestion" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT,
    "status" "StudentQuestionStatus" NOT NULL DEFAULT 'OPEN',
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "studentReadAt" TIMESTAMP(3),
    "staffReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionMessage" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "senderType" "QuestionMessageSenderType" NOT NULL,
    "senderUserId" TEXT,
    "content" TEXT NOT NULL DEFAULT '',
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VocabBookEntry_bookId_unit_idx" ON "VocabBookEntry"("bookId", "unit");

-- CreateIndex
CREATE INDEX "VocabExam_bookId_idx" ON "VocabExam"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "VocabAttempt_token_key" ON "VocabAttempt"("token");

-- CreateIndex
CREATE INDEX "VocabAttempt_studentId_idx" ON "VocabAttempt"("studentId");

-- CreateIndex
CREATE INDEX "VocabAttempt_examId_idx" ON "VocabAttempt"("examId");

-- CreateIndex
CREATE INDEX "VocabAttemptItem_attemptId_idx" ON "VocabAttemptItem"("attemptId");

-- CreateIndex
CREATE INDEX "StudentQuestion_studentId_createdAt_idx" ON "StudentQuestion"("studentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StudentQuestion_status_lastMessageAt_idx" ON "StudentQuestion"("status", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "QuestionMessage_questionId_createdAt_idx" ON "QuestionMessage"("questionId", "createdAt");

-- AddForeignKey
ALTER TABLE "VocabBookEntry" ADD CONSTRAINT "VocabBookEntry_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "VocabBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabExam" ADD CONSTRAINT "VocabExam_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "VocabBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabAttempt" ADD CONSTRAINT "VocabAttempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "VocabExam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabAttempt" ADD CONSTRAINT "VocabAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabAttemptItem" ADD CONSTRAINT "VocabAttemptItem_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "VocabAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentQuestion" ADD CONSTRAINT "StudentQuestion_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentQuestion" ADD CONSTRAINT "StudentQuestion_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionMessage" ADD CONSTRAINT "QuestionMessage_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "StudentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionMessage" ADD CONSTRAINT "QuestionMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 적용 후 검증 쿼리 (참고):
--   SELECT count(*) FROM "StudentQuestion";    -- 0
--   SELECT count(*) FROM "VocabBook";          -- 0
--   SELECT typname FROM pg_type WHERE typname LIKE 'Vocab%' OR typname LIKE '%Question%';

COMMIT;
