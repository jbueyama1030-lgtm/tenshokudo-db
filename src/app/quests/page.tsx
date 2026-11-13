// 置き場所: src/app/quests/page.tsx
// 自分のクエスト（スマホで使う前提の画面）

import { redirect } from "next/navigation"
import { auth } from "@/auth"
import Sidebar from "@/components/Sidebar"
import QuestBoard from "@/components/QuestBoard"
import { isAgencyUser } from "@/lib/permissions"

export default async function QuestsPage() {
  const session = await auth()
  if (!session) redirect("/login")
  // クエストは社内向け（代理店ユーザーには出さない）
  if (isAgencyUser(session)) redirect("/dashboard")

  return (
    <div className="flex h-screen bg-gray-50">
      {/* スマホでは左のメニューを隠して、画面いっぱいに使う */}
      <div className="hidden md:flex">
        <Sidebar userName={session.user?.name ?? ""} />
      </div>
      <main className="flex-1 overflow-auto">
        <QuestBoard userName={session.user?.name ?? ""} />
      </main>
    </div>
  )
}
