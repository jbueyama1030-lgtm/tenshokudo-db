-- CreateTable
CREATE TABLE "JobArticle" (
    "id" TEXT NOT NULL,
    "sourceCompanyId" TEXT NOT NULL,
    "companyRef" TEXT,
    "name" TEXT NOT NULL,
    "prefecture" TEXT,
    "city" TEXT,
    "title" TEXT,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "planType1" TEXT,
    "planType2" TEXT,
    "priceRank" TEXT,
    "scores" JSONB,
    "pageUpdatedAt" TIMESTAMP(3),
    "isListed" BOOLEAN NOT NULL DEFAULT true,
    "delistedAt" TIMESTAMP(3),
    "contentHash" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "lastImportedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobArticleSnapshot" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "pageUpdatedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobArticleSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobArticle_sourceCompanyId_key" ON "JobArticle"("sourceCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "JobArticle_companyRef_key" ON "JobArticle"("companyRef");

-- CreateIndex
CREATE INDEX "JobArticle_prefecture_idx" ON "JobArticle"("prefecture");

-- CreateIndex
CREATE INDEX "JobArticle_isListed_idx" ON "JobArticle"("isListed");

-- CreateIndex
CREATE INDEX "JobArticleSnapshot_articleId_capturedAt_idx" ON "JobArticleSnapshot"("articleId", "capturedAt");

-- AddForeignKey
ALTER TABLE "JobArticle" ADD CONSTRAINT "JobArticle_companyRef_fkey" FOREIGN KEY ("companyRef") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobArticleSnapshot" ADD CONSTRAINT "JobArticleSnapshot_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "JobArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
