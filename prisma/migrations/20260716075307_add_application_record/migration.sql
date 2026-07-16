-- CreateTable
CREATE TABLE "ApplicationRecord" (
    "id" TEXT NOT NULL,
    "sourceCompanyId" TEXT NOT NULL,
    "companyRef" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "inflow" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationRecord_year_month_idx" ON "ApplicationRecord"("year", "month");

-- CreateIndex
CREATE INDEX "ApplicationRecord_inflow_idx" ON "ApplicationRecord"("inflow");

-- CreateIndex
CREATE INDEX "ApplicationRecord_sourceCompanyId_idx" ON "ApplicationRecord"("sourceCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationRecord_sourceCompanyId_appliedAt_inflow_key" ON "ApplicationRecord"("sourceCompanyId", "appliedAt", "inflow");

-- AddForeignKey
ALTER TABLE "ApplicationRecord" ADD CONSTRAINT "ApplicationRecord_companyRef_fkey" FOREIGN KEY ("companyRef") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
