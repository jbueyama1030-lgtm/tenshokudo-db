/*
  Warnings:

  - A unique constraint covering the columns `[name,year,month]` on the table `AdCost` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `name` to the `AdCost` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "AdCost_inflow_year_month_key";

-- AlterTable
ALTER TABLE "AdCost" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'direct',
ADD COLUMN     "memo" TEXT,
ADD COLUMN     "name" TEXT NOT NULL,
ALTER COLUMN "inflow" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "AdCost_inflow_idx" ON "AdCost"("inflow");

-- CreateIndex
CREATE UNIQUE INDEX "AdCost_name_year_month_key" ON "AdCost"("name", "year", "month");
