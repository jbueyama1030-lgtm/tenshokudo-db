-- CreateTable
CREATE TABLE "AdCost" (
    "id" TEXT NOT NULL,
    "inflow" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "costType" TEXT NOT NULL DEFAULT 'operation',
    "unitPrice" INTEGER,
    "totalCost" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdCost_year_month_idx" ON "AdCost"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "AdCost_inflow_year_month_key" ON "AdCost"("inflow", "year", "month");
