-- AlterTable
ALTER TABLE "OnlineParentReport" ADD COLUMN     "uniqueViewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OnlineParentFeedback" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "name" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "OnlineParentFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnlineParentFeedback_reportId_createdAt_idx" ON "OnlineParentFeedback"("reportId", "createdAt");

-- AddForeignKey
ALTER TABLE "OnlineParentFeedback" ADD CONSTRAINT "OnlineParentFeedback_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "OnlineParentReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
