-- CreateTable
CREATE TABLE "MonthlyPlan" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "milestones" JSONB NOT NULL DEFAULT '{}',
    "subjectGoals" JSONB NOT NULL DEFAULT '{}',
    "retrospective" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthlyPlan_authorId_yearMonth_idx" ON "MonthlyPlan"("authorId", "yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyPlan_studentId_yearMonth_key" ON "MonthlyPlan"("studentId", "yearMonth");

-- AddForeignKey
ALTER TABLE "MonthlyPlan" ADD CONSTRAINT "MonthlyPlan_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPlan" ADD CONSTRAINT "MonthlyPlan_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
