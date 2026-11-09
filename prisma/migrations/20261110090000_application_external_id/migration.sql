-- 応募IDと取り込み元を追加（応募通知API・1時間ごとの差分取り込み用）
ALTER TABLE "ApplicationRecord" ADD COLUMN "externalId" TEXT;
ALTER TABLE "ApplicationRecord" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'csv';
CREATE UNIQUE INDEX "ApplicationRecord_externalId_key" ON "ApplicationRecord"("externalId");

-- 外部連携の状態
CREATE TABLE "SyncState" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("key")
);
