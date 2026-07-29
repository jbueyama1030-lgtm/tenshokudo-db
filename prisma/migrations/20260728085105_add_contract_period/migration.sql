-- CreateTable
CREATE TABLE "ContractPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'contracted',
    "contractStart" TIMESTAMP(3),
    "contractRenewal" TIMESTAMP(3),
    "contractEnd" TIMESTAMP(3),
    "planName" TEXT,
    "monthlyFee" INTEGER,
    "discountRate" DOUBLE PRECISION,
    "discountNote" TEXT,
    "options" JSONB,
    "contractNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractPeriod_companyId_idx" ON "ContractPeriod"("companyId");

-- CreateIndex
CREATE INDEX "ContractPeriod_contractStart_idx" ON "ContractPeriod"("contractStart");

-- CreateIndex
CREATE INDEX "ContractPeriod_contractEnd_idx" ON "ContractPeriod"("contractEnd");

-- AddForeignKey
ALTER TABLE "ContractPeriod" ADD CONSTRAINT "ContractPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
