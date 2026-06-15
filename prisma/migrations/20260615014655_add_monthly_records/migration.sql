-- CreateTable
CREATE TABLE "MonthlyRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "applyCount" INTEGER NOT NULL DEFAULT 0,
    "hireCount" INTEGER NOT NULL DEFAULT 0,
    "inflowBreakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyRecord_companyId_year_month_key" ON "MonthlyRecord"("companyId", "year", "month");

-- AddForeignKey
ALTER TABLE "MonthlyRecord" ADD CONSTRAINT "MonthlyRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
