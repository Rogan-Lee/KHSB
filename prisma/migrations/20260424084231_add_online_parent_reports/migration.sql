-- CreateEnum
CREATE TYPE "OnlineReportType" AS ENUM ('WEEKLY', 'MONTHLY', 'ADHOC');

-- CreateEnum
CREATE TYPE "OnlineReportStatus" AS ENUM ('DRAFT', 'DRAFT_FAILED', 'REVIEW', 'APPROVED', 'SENT');

-- CreateTable
CREATE TABLE "OnlineParentReport" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "OnlineReportType" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "status" "OnlineReportStatus" NOT NULL DEFAULT 'DRAFT',
    "token" TEXT NOT NULL,
    "sentChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnlineParentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnlineParentReport_token_key" ON "OnlineParentReport"("token");

-- CreateIndex
CREATE INDEX "OnlineParentReport_status_idx" ON "OnlineParentReport"("status");

-- CreateIndex
CREATE INDEX "OnlineParentReport_type_periodStart_idx" ON "OnlineParentReport"("type", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "OnlineParentReport_studentId_type_periodStart_key" ON "OnlineParentReport"("studentId", "type", "periodStart");

-- AddForeignKey
ALTER TABLE "OnlineParentReport" ADD CONSTRAINT "OnlineParentReport_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineParentReport" ADD CONSTRAINT "OnlineParentReport_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
