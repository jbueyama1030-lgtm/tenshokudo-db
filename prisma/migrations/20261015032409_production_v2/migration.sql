-- DropForeignKey
ALTER TABLE "ProductionTask" DROP CONSTRAINT "ProductionTask_companyId_fkey";

-- AlterTable
ALTER TABLE "ProductionTask" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'article',
ADD COLUMN     "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "companyId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "_TaskSubAssignees" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TaskSubAssignees_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_TaskSubAssignees_B_index" ON "_TaskSubAssignees"("B");

-- AddForeignKey
ALTER TABLE "ProductionTask" ADD CONSTRAINT "ProductionTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskSubAssignees" ADD CONSTRAINT "_TaskSubAssignees_A_fkey" FOREIGN KEY ("A") REFERENCES "ProductionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskSubAssignees" ADD CONSTRAINT "_TaskSubAssignees_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
