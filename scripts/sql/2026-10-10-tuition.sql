-- 수강료 청구·결제 (2026-10-10) — Tuition* 테이블 8개와 enum 11개. 추가 전용, 다시 실행해도 안전(멱등).
-- 기존 테이블은 건드리지 않는다 (Student 로 가는 외래키만 추가).
-- 적용: Supabase SQL 편집기에서 실행
--       (개발 DB: npm run db:push 뒤에 node scripts/apply-additive-sql.mjs scripts/sql/2026-10-10-tuition.sql DATABASE_URL_DEV — CHECK·RLS 반영)
-- 순서: 이 SQL 을 먼저 실행한 뒤 코드를 배포한다 (테이블이 없으면 /tuition 과 학부모 앱 수강료 조회가 실패한다).
--
-- CHECK 제약과 RLS 는 Prisma 스키마로 표현할 수 없어 이 파일에만 있다.
--  · CHECK: 금액·기간·환불 합계가 어긋난 행을 DB 가 거부한다 (코드 실수 대비 마지막 방어선).
--  · RLS: 정책 없이 켜서 Supabase API(anon/authenticated) 접근을 막는다. Prisma 는 테이블 소유자라 영향 없다.

BEGIN;

-- enum
DO $$ BEGIN
  CREATE TYPE "TuitionInvoiceStatus" AS ENUM ('REQUESTED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "TuitionPaymentMethod" AS ENUM ('LINK', 'LOCAL_CURRENCY', 'ONSITE_CARD', 'CASH', 'TRANSFER');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "TuitionPaymentStatus" AS ENUM ('PENDING', 'ONSITE_REQUESTED', 'DONE', 'CANCELED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "TuitionRefundMethod" AS ENUM ('PROVIDER', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "TuitionRefundSource" AS ENUM ('STAFF', 'AUTO_DUPLICATE', 'EXTERNAL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "TuitionRefundStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "TuitionRefundPolicy" AS ENUM ('DAILY', 'ACADEMY_LAW', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "TuitionTaxType" AS ENUM ('EXEMPT', 'TAXABLE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "TuitionCashReceiptPurpose" AS ENUM ('INCOME', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "TuitionCashReceiptStatus" AS ENUM ('REQUESTED', 'ISSUED', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "TuitionNoticeKind" AS ENUM ('REQUEST', 'REMIND', 'RENEWAL', 'PAID', 'REFUND');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 테이블
CREATE TABLE IF NOT EXISTS "TuitionSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "defaultMonthlyFee" INTEGER,
    "dueDays" INTEGER NOT NULL DEFAULT 7,
    "leadDays" INTEGER NOT NULL DEFAULT 7,
    "reminderDays" TEXT NOT NULL DEFAULT '7,3',
    "refundPolicy" "TuitionRefundPolicy" NOT NULL DEFAULT 'DAILY',
    "onlinePaymentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "taxType" "TuitionTaxType" NOT NULL DEFAULT 'EXEMPT',
    "autoIssueEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoIssueLeadDays" INTEGER NOT NULL DEFAULT 3,
    "guideText" TEXT,
    "onsiteGuideText" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TuitionSetting_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "TuitionProfile" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "monthlyFee" INTEGER,
    "billingPaused" BOOLEAN NOT NULL DEFAULT false,
    "memo" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TuitionProfile_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "TuitionInvoice" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "months" INTEGER NOT NULL,
    "monthlyFee" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "extraItems" JSONB,
    "amount" INTEGER NOT NULL,
    "taxType" "TuitionTaxType" NOT NULL DEFAULT 'EXEMPT',
    "parentMessage" TEXT,
    "shareToken" TEXT,
    "autoIssued" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" DATE NOT NULL,
    "status" "TuitionInvoiceStatus" NOT NULL DEFAULT 'REQUESTED',
    "memo" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "paidPaymentId" TEXT,
    "refundedAmount" INTEGER NOT NULL DEFAULT 0,
    "coverageEnd" DATE,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "issuedById" TEXT,
    "issuedByName" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledById" TEXT,
    "canceledByName" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TuitionInvoice_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "TuitionPayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "method" "TuitionPaymentMethod" NOT NULL,
    "status" "TuitionPaymentStatus" NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "refundedAmount" INTEGER NOT NULL DEFAULT 0,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "closedReason" TEXT,
    "providerProductKey" TEXT,
    "payUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "checkoutStartedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "linkSourcePaymentId" TEXT,
    "providerOrderKey" TEXT,
    "providerPaymentKey" TEXT,
    "providerMethod" TEXT,
    "cardIssuer" TEXT,
    "cardType" TEXT,
    "installmentMonths" INTEGER,
    "approvalNumber" TEXT,
    "approvedAt" TIMESTAMP(3),
    "receiptUrl" TEXT,
    "depositBank" TEXT,
    "depositAccount" TEXT,
    "depositDueAt" TIMESTAMP(3),
    "failCode" TEXT,
    "failMessage" TEXT,
    "requestedByAuthUserId" TEXT,
    "requestedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "confirmedByName" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TuitionPayment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "TuitionRefund" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "calcBasis" TEXT,
    "effectiveDate" DATE,
    "method" "TuitionRefundMethod" NOT NULL,
    "source" "TuitionRefundSource" NOT NULL DEFAULT 'STAFF',
    "status" "TuitionRefundStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "providerTransactionKey" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "failCode" TEXT,
    "failMessage" TEXT,
    "requestedById" TEXT,
    "requestedByName" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TuitionRefund_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "TuitionCashReceipt" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "purpose" "TuitionCashReceiptPurpose" NOT NULL,
    "identifier" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "supplyAmount" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL,
    "status" "TuitionCashReceiptStatus" NOT NULL DEFAULT 'REQUESTED',
    "approvalNumber" TEXT,
    "requestedById" TEXT,
    "requestedByName" TEXT,
    "issuedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "issuedByName" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledById" TEXT,
    "canceledByName" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TuitionCashReceipt_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "TuitionNotice" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" "TuitionNoticeKind" NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "dedupKey" TEXT,
    "sentById" TEXT,
    "sentByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TuitionNotice_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "TuitionEvent" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "refundId" TEXT,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TuitionEvent_pkey" PRIMARY KEY ("id")
);

-- 이 파일의 이전 판을 이미 실행한 DB 보정 — 그 뒤에 추가된 컬럼 (새로 만든 DB 에서는 아무 일도 하지 않는다)
ALTER TABLE "TuitionSetting" ADD COLUMN IF NOT EXISTS "taxType" "TuitionTaxType" NOT NULL DEFAULT 'EXEMPT';
ALTER TABLE "TuitionSetting" ADD COLUMN IF NOT EXISTS "autoIssueEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TuitionSetting" ADD COLUMN IF NOT EXISTS "autoIssueLeadDays" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "TuitionInvoice" ADD COLUMN IF NOT EXISTS "extraItems" JSONB;
ALTER TABLE "TuitionInvoice" ADD COLUMN IF NOT EXISTS "taxType" "TuitionTaxType" NOT NULL DEFAULT 'EXEMPT';
ALTER TABLE "TuitionInvoice" ADD COLUMN IF NOT EXISTS "parentMessage" TEXT;
ALTER TABLE "TuitionInvoice" ADD COLUMN IF NOT EXISTS "shareToken" TEXT;
ALTER TABLE "TuitionInvoice" ADD COLUMN IF NOT EXISTS "autoIssued" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TuitionPayment" ADD COLUMN IF NOT EXISTS "cardIssuer" TEXT;
ALTER TABLE "TuitionPayment" ADD COLUMN IF NOT EXISTS "cardType" TEXT;
ALTER TABLE "TuitionPayment" ADD COLUMN IF NOT EXISTS "installmentMonths" INTEGER;
ALTER TABLE "TuitionPayment" ADD COLUMN IF NOT EXISTS "approvalNumber" TEXT;

-- 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS "TuitionProfile_studentId_key" ON "TuitionProfile"("studentId");
CREATE UNIQUE INDEX IF NOT EXISTS "TuitionInvoice_shareToken_key" ON "TuitionInvoice"("shareToken");
CREATE UNIQUE INDEX IF NOT EXISTS "TuitionInvoice_paidPaymentId_key" ON "TuitionInvoice"("paidPaymentId");
CREATE INDEX IF NOT EXISTS "TuitionInvoice_studentId_periodStart_idx" ON "TuitionInvoice"("studentId", "periodStart");
CREATE INDEX IF NOT EXISTS "TuitionInvoice_status_dueDate_idx" ON "TuitionInvoice"("status", "dueDate");
CREATE INDEX IF NOT EXISTS "TuitionInvoice_dueDate_idx" ON "TuitionInvoice"("dueDate");
CREATE UNIQUE INDEX IF NOT EXISTS "TuitionPayment_providerProductKey_key" ON "TuitionPayment"("providerProductKey");
CREATE UNIQUE INDEX IF NOT EXISTS "TuitionPayment_providerOrderKey_key" ON "TuitionPayment"("providerOrderKey");
CREATE UNIQUE INDEX IF NOT EXISTS "TuitionPayment_providerPaymentKey_key" ON "TuitionPayment"("providerPaymentKey");
CREATE INDEX IF NOT EXISTS "TuitionPayment_invoiceId_idx" ON "TuitionPayment"("invoiceId");
CREATE INDEX IF NOT EXISTS "TuitionPayment_status_createdAt_idx" ON "TuitionPayment"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "TuitionPayment_method_status_idx" ON "TuitionPayment"("method", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "TuitionRefund_idempotencyKey_key" ON "TuitionRefund"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "TuitionRefund_providerTransactionKey_key" ON "TuitionRefund"("providerTransactionKey");
CREATE INDEX IF NOT EXISTS "TuitionRefund_invoiceId_idx" ON "TuitionRefund"("invoiceId");
CREATE INDEX IF NOT EXISTS "TuitionRefund_paymentId_idx" ON "TuitionRefund"("paymentId");
CREATE INDEX IF NOT EXISTS "TuitionRefund_status_createdAt_idx" ON "TuitionRefund"("status", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "TuitionCashReceipt_paymentId_key" ON "TuitionCashReceipt"("paymentId");
CREATE INDEX IF NOT EXISTS "TuitionCashReceipt_invoiceId_idx" ON "TuitionCashReceipt"("invoiceId");
CREATE INDEX IF NOT EXISTS "TuitionCashReceipt_status_createdAt_idx" ON "TuitionCashReceipt"("status", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "TuitionNotice_dedupKey_key" ON "TuitionNotice"("dedupKey");
CREATE INDEX IF NOT EXISTS "TuitionNotice_invoiceId_createdAt_idx" ON "TuitionNotice"("invoiceId", "createdAt");
CREATE INDEX IF NOT EXISTS "TuitionEvent_invoiceId_createdAt_idx" ON "TuitionEvent"("invoiceId", "createdAt");
CREATE INDEX IF NOT EXISTS "TuitionEvent_createdAt_idx" ON "TuitionEvent"("createdAt");

-- 외래키
DO $$ BEGIN
  ALTER TABLE "TuitionProfile" ADD CONSTRAINT "TuitionProfile_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "TuitionInvoice" ADD CONSTRAINT "TuitionInvoice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "TuitionPayment" ADD CONSTRAINT "TuitionPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "TuitionInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "TuitionRefund" ADD CONSTRAINT "TuitionRefund_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "TuitionInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "TuitionRefund" ADD CONSTRAINT "TuitionRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "TuitionPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "TuitionCashReceipt" ADD CONSTRAINT "TuitionCashReceipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "TuitionInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "TuitionCashReceipt" ADD CONSTRAINT "TuitionCashReceipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "TuitionPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "TuitionNotice" ADD CONSTRAINT "TuitionNotice_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "TuitionInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CHECK 제약
DO $$ BEGIN
  ALTER TABLE "TuitionInvoice" ADD CONSTRAINT "TuitionInvoice_amount_check" CHECK ("amount" > 0 AND "monthlyFee" > 0 AND "discount" >= 0);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "TuitionInvoice" ADD CONSTRAINT "TuitionInvoice_months_check" CHECK ("months" BETWEEN 1 AND 12);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "TuitionInvoice" ADD CONSTRAINT "TuitionInvoice_period_check" CHECK ("periodEnd" >= "periodStart");
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "TuitionInvoice" ADD CONSTRAINT "TuitionInvoice_refund_check" CHECK ("paidAmount" >= 0 AND "refundedAmount" >= 0 AND "refundedAmount" <= "paidAmount");
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "TuitionInvoice" ADD CONSTRAINT "TuitionInvoice_paid_check" CHECK (("status" IN ('REQUESTED', 'CANCELED')) = ("paidPaymentId" IS NULL));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "TuitionPayment" ADD CONSTRAINT "TuitionPayment_amount_check" CHECK ("amount" > 0 AND "paidAmount" >= 0 AND "refundedAmount" >= 0 AND "refundedAmount" <= "paidAmount");
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "TuitionRefund" ADD CONSTRAINT "TuitionRefund_amount_check" CHECK ("amount" > 0);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "TuitionCashReceipt" ADD CONSTRAINT "TuitionCashReceipt_amount_check" CHECK ("amount" > 0 AND "supplyAmount" >= 0 AND "taxAmount" >= 0 AND "supplyAmount" + "taxAmount" = "amount");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- RLS
ALTER TABLE "TuitionSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TuitionProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TuitionInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TuitionPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TuitionRefund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TuitionCashReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TuitionNotice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TuitionEvent" ENABLE ROW LEVEL SECURITY;

COMMIT;
