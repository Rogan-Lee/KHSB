-- 가족 톡방 — 새 테이블 3개 + enum 1개, 푸시 카테고리 값 1개, 기기 알림 설정 열 1개 (additive)
-- 여러 번 실행해도 안전하다. Supabase SQL 편집기에서 통째로 실행.

-- enum 값 추가는 트랜잭션 밖에서 (Postgres 는 같은 트랜잭션에서 새 값을 못 쓴다)
ALTER TYPE "PushNotificationCategory" ADD VALUE IF NOT EXISTS 'FAMILY_CHAT';

BEGIN;

DO $$ BEGIN
  CREATE TYPE "FamilyChatSender" AS ENUM ('STUDENT', 'PARENT', 'STAFF', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "DevicePushToken" ADD COLUMN IF NOT EXISTS "familyChatEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "FamilyChat" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "familyMessageAt" TIMESTAMP(3),
    "staffReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyChat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FamilyChatMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderKind" "FamilyChatSender" NOT NULL,
    "senderId" TEXT,
    "senderName" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FamilyChatRead" (
    "chatId" TEXT NOT NULL,
    "readerKind" "FamilyChatSender" NOT NULL,
    "readerId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyChatRead_pkey" PRIMARY KEY ("chatId","readerKind","readerId")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FamilyChat_studentId_key" ON "FamilyChat"("studentId");
CREATE INDEX IF NOT EXISTS "FamilyChat_lastMessageAt_idx" ON "FamilyChat"("lastMessageAt" DESC);
CREATE INDEX IF NOT EXISTS "FamilyChatMessage_chatId_createdAt_idx" ON "FamilyChatMessage"("chatId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "FamilyChat" ADD CONSTRAINT "FamilyChat_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FamilyChatMessage" ADD CONSTRAINT "FamilyChatMessage_chatId_fkey"
    FOREIGN KEY ("chatId") REFERENCES "FamilyChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FamilyChatRead" ADD CONSTRAINT "FamilyChatRead_chatId_fkey"
    FOREIGN KEY ("chatId") REFERENCES "FamilyChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS: 정책 없이 켜 둔다 — 서버(Prisma, postgres 역할)만 접근하고 PostgREST(anon·authenticated)로는 못 읽는다.
ALTER TABLE "FamilyChat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FamilyChatMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FamilyChatRead" ENABLE ROW LEVEL SECURITY;

COMMIT;
