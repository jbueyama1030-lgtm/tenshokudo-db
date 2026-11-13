-- 企業に営業補佐（担当営業とは別に、一緒にこの企業を見る人）を1人登録できるようにする
ALTER TABLE "Company" ADD COLUMN "assistantUserId" TEXT;

CREATE INDEX "Company_assistantUserId_idx" ON "Company"("assistantUserId");

ALTER TABLE "Company" ADD CONSTRAINT "Company_assistantUserId_fkey" FOREIGN KEY ("assistantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
