-- AlterTable
ALTER TABLE "ApplicationRecord" ADD COLUMN     "age" INTEGER,
ADD COLUMN     "applicantPref" TEXT,
ADD COLUMN     "companyOpened" BOOLEAN,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "hasLicense2" BOOLEAN;

-- CreateIndex
CREATE INDEX "ApplicationRecord_companyOpened_idx" ON "ApplicationRecord"("companyOpened");
