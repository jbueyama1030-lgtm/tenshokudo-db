-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "corporateGroupId" TEXT;

-- CreateTable
CREATE TABLE "CompanyGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'corporate',
    "color" TEXT,
    "note" TEXT,
    "sourceGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CompanyTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CompanyTags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyGroup_sourceGroupId_key" ON "CompanyGroup"("sourceGroupId");

-- CreateIndex
CREATE INDEX "CompanyGroup_kind_idx" ON "CompanyGroup"("kind");

-- CreateIndex
CREATE INDEX "_CompanyTags_B_index" ON "_CompanyTags"("B");

-- CreateIndex
CREATE INDEX "Company_corporateGroupId_idx" ON "Company"("corporateGroupId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_corporateGroupId_fkey" FOREIGN KEY ("corporateGroupId") REFERENCES "CompanyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompanyTags" ADD CONSTRAINT "_CompanyTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompanyTags" ADD CONSTRAINT "_CompanyTags_B_fkey" FOREIGN KEY ("B") REFERENCES "CompanyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
