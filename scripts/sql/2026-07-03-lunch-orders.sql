-- 2026-07-03 방학 점심 도시락 — LunchMenu/LunchOrder/LunchOrderItem/LunchSetting (추가 전용, 멱등)
BEGIN;

DO $$ BEGIN
  CREATE TYPE "LunchPaidStatus" AS ENUM ('PENDING', 'PAID');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "LunchMenu" (
  "id"          TEXT PRIMARY KEY,
  "date"        DATE NOT NULL,
  "name"        TEXT NOT NULL,
  "price"       INTEGER NOT NULL,
  "buffer"      INTEGER NOT NULL DEFAULT 0,
  "closed"      BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "LunchMenu_date_key" ON "LunchMenu" ("date");
CREATE INDEX IF NOT EXISTS "LunchMenu_date_idx" ON "LunchMenu" ("date");

CREATE TABLE IF NOT EXISTS "LunchOrder" (
  "id"         TEXT PRIMARY KEY,
  "studentId"  TEXT NOT NULL,
  "paidStatus" "LunchPaidStatus" NOT NULL DEFAULT 'PENDING',
  "paidAt"     TIMESTAMP(3),
  "paidById"   TEXT,
  "memo"       TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "LunchOrder_studentId_idx" ON "LunchOrder" ("studentId");
CREATE INDEX IF NOT EXISTS "LunchOrder_paidStatus_idx" ON "LunchOrder" ("paidStatus");

CREATE TABLE IF NOT EXISTS "LunchOrderItem" (
  "id"         TEXT PRIMARY KEY,
  "orderId"    TEXT NOT NULL,
  "menuId"     TEXT NOT NULL,
  "price"      INTEGER NOT NULL,
  "received"   BOOLEAN NOT NULL DEFAULT false,
  "receivedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "LunchOrderItem_orderId_menuId_key" ON "LunchOrderItem" ("orderId", "menuId");
CREATE INDEX IF NOT EXISTS "LunchOrderItem_menuId_idx" ON "LunchOrderItem" ("menuId");

CREATE TABLE IF NOT EXISTS "LunchSetting" (
  "id"        TEXT PRIMARY KEY DEFAULT 'default',
  "bankInfo"  TEXT,
  "guideText" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "LunchOrder" ADD CONSTRAINT "LunchOrder_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "LunchOrderItem" ADD CONSTRAINT "LunchOrderItem_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "LunchOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "LunchOrderItem" ADD CONSTRAINT "LunchOrderItem_menuId_fkey"
    FOREIGN KEY ("menuId") REFERENCES "LunchMenu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMIT;
