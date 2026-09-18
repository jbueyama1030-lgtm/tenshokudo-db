-- AlterTable
ALTER TABLE "ApplicationRecord" ADD COLUMN     "phoneHash" TEXT;

-- CreateIndex
CREATE INDEX "ApplicationRecord_phoneHash_idx" ON "ApplicationRecord"("phoneHash");
