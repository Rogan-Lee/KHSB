-- 학부모 주차 등록 기록 — 새 테이블 1개, 기존 테이블은 건드리지 않는다 (additive)
-- 여러 번 실행해도 안전하다.
CREATE TABLE IF NOT EXISTS "ParkingRegistration" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "carNo" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "flags" TEXT[],
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParkingRegistration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ParkingRegistration_date_idx" ON "ParkingRegistration"("date");
CREATE INDEX IF NOT EXISTS "ParkingRegistration_carNo_date_idx" ON "ParkingRegistration"("carNo", "date");
CREATE INDEX IF NOT EXISTS "ParkingRegistration_studentId_date_idx" ON "ParkingRegistration"("studentId", "date");
CREATE INDEX IF NOT EXISTS "ParkingRegistration_authUserId_createdAt_idx" ON "ParkingRegistration"("authUserId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ParkingRegistration" ADD CONSTRAINT "ParkingRegistration_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ParkingRegistration" ADD CONSTRAINT "ParkingRegistration_authUserId_fkey" FOREIGN KEY ("authUserId") REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 다른 테이블과 같이 Supabase 공개 API(anon) 접근을 막는다 — 서버는 Prisma(소유자 권한)로만 읽고 쓴다
ALTER TABLE "ParkingRegistration" ENABLE ROW LEVEL SECURITY;
