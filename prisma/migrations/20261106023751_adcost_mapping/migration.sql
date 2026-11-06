-- CreateTable
CREATE TABLE "AdCostMapping" (
    "id" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'direct',
    "adName" TEXT,
    "inflow" TEXT,
    "splitAName" TEXT,
    "splitAInflow" TEXT,
    "splitBName" TEXT,
    "splitBInflow" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCostMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdCostMapping_sourceName_key" ON "AdCostMapping"("sourceName");
