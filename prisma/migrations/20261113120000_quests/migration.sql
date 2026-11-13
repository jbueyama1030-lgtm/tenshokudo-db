-- クエスト（初回電話など）と、自動化の設定・会社独自の休みを追加する

-- CreateTable
CREATE TABLE "Quest" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT,
    "applicationId" TEXT,
    "lockedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "result" TEXT,
    "resultNote" TEXT,
    "doneById" TEXT,
    "doneAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationSetting" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "BusinessHoliday" (
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessHoliday_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "_QuestAssignees" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_QuestAssignees_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Quest_status_dueAt_idx" ON "Quest"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Quest_companyId_idx" ON "Quest"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Quest_type_applicationId_attempt_key" ON "Quest"("type", "applicationId", "attempt");

-- CreateIndex
CREATE INDEX "_QuestAssignees_B_index" ON "_QuestAssignees"("B");

-- AddForeignKey
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ApplicationRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_QuestAssignees" ADD CONSTRAINT "_QuestAssignees_A_fkey" FOREIGN KEY ("A") REFERENCES "Quest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_QuestAssignees" ADD CONSTRAINT "_QuestAssignees_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
