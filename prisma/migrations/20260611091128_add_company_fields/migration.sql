/*
  Warnings:

  - A unique constraint covering the columns `[companyId]` on the table `Company` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "address" TEXT,
ADD COLUMN     "applyCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "hireCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "media" TEXT,
ADD COLUMN     "memo" TEXT,
ADD COLUMN     "persona" TEXT[],
ADD COLUMN     "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Company_companyId_key" ON "Company"("companyId");
