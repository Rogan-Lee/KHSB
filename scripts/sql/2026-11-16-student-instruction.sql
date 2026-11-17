-- 학생 지시 — 새 테이블 1개 (additive)
-- 여러 번 실행해도 안전하다. Supabase SQL 편집기에서 통째로 실행.

BEGIN;

CREATE TABLE IF NOT EXISTS "StudentInstruction" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "communicationId" TEXT,
    "content" TEXT NOT NULL,
    "sentById" TEXT,
    "sentByName" TEXT,
    "sentAt" TIMESTAMP(3),
    "ackedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentInstruction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StudentInstruction_studentId_createdAt_idx" ON "StudentInstruction"("studentId", "createdAt");
CREATE INDEX IF NOT EXISTS "StudentInstruction_communicationId_idx" ON "StudentInstruction"("communicationId");
CREATE INDEX IF NOT EXISTS "StudentInstruction_sentAt_idx" ON "StudentInstruction"("sentAt");

DO $$ BEGIN
  ALTER TABLE "StudentInstruction" ADD CONSTRAINT "StudentInstruction_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StudentInstruction" ADD CONSTRAINT "StudentInstruction_communicationId_fkey"
    FOREIGN KEY ("communicationId") REFERENCES "Communication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS: 정책 없이 켜 둔다 — 서버(Prisma, postgres 역할)만 접근하고 PostgREST(anon·authenticated)로는 못 읽는다.
ALTER TABLE "StudentInstruction" ENABLE ROW LEVEL SECURITY;

COMMIT;
