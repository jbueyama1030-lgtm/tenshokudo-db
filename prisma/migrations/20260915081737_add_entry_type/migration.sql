-- AlterTable
ALTER TABLE "ApplicationRecord" ADD COLUMN     "entryType" TEXT;

-- CreateIndex
CREATE INDEX "ApplicationRecord_entryType_idx" ON "ApplicationRecord"("entryType");
