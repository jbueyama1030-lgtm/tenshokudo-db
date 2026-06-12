-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "negotiationMemo" TEXT,
ADD COLUMN     "nextAction" TEXT,
ADD COLUMN     "nextActionDate" TIMESTAMP(3),
ADD COLUMN     "temperature" TEXT;
