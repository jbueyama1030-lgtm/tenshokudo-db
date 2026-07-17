"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

export default function Sidebar({ userName }: { userName?: string }) {
  const pathname = usePathname()
  const [role, setRole] = useState<string>("")
  const [unassignedCount, setUnassignedCount] = useState(0)

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => {
      setRole(s?.user?.role ?? "")
    })
    fetch("/api/production-tasks").then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        setUnassignedCount(data.filter(t => !t.assignee).length)
      }
    })
  }, [])

  const isProduction = role === "production"
  const isAdmin = role !== "sales" && role !== "production"

  const salesLinks = [
    { href: "/dashboard", label: "📊 ダッシュボード" },
    { href: "/companies", label: "🏢 企業一覧" },
    { href: "/companies/new", label: "➕ 企業追加" },
    { href: "/companies/import", label: "📥 CSVインポート" },
    { href: "/users", label: "👥 ユーザー管理" },
    { href: "/companies/import-hearing", label: "📋 ヒアリングインポート" },
    { href: "/companies/import-monthly", label: "📈 月次インポート" },
  ]

  const productionLinks = [
    { href: "/production", label: "🎨 制作ダッシュボード" },
  ]

  const adminLinks = [
    { href: "/marketing", label: "📊 マーケ分析" },
    { href: "/import/applications", label: "📥 応募明細インポート" },
    { href: "/marketing/ad-costs", label: "📥 💰 広告費入力" },
    { href: "/marketing/area", label: "📥 🗾 エリア別分析" },
    { href: "/marketing/cross", label: "📥 🔀 エリア×媒体" },
  ]

  const links = [
    ...salesLinks,
    ...(isProduction || isAdmin ? productionLinks : []),
    ...(isAdmin ? adminLinks : []),
  ]

  return (
    <aside className="w-48 min-w-48 bg-[#0C1A2E] flex flex-col">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="text-sm font-semibold text-white">🚕 転職道</div>
        <div className="text-xs text-white/30 mt-0.5">営業DB</div>
      </div>
      <nav className="flex-1 py-4 overflow-y-auto">
        <div className="px-5 pb-2 text-[10px] text-white/25 uppercase tracking-widest">メニュー</div>
        {links.map(link => {
          const isActive = pathname === link.href || (link.href === "/companies" ? false : pathname.startsWith(link.href + "/"))
          return (
            <a
              key={link.href}
              href={link.href}
              className={"flex items-center gap-2.5 px-5 py-2 text-sm border-l-2 transition-colors " + (isActive ? "text-white border-[#378ADD] bg-[#378ADD]/10" : "text-white/45 hover:text-white/75 hover:bg-white/5 border-transparent")}
            >
              <span>{link.label}</span>
              {link.href === "/production" && unassignedCount > 0 && (
                <span className="ml-auto text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold">{unassignedCount}</span>
              )}
            </a>
          )
        })}
      </nav>
      <div className="px-5 py-4 border-t border-white/10 flex items-center gap-2.5">
        {userName && (
          <>
            <div className="w-7 h-7 rounded-full bg-[#185FA5] flex items-center justify-center text-xs text-white font-medium">
              {userName.charAt(0)}
            </div>
            <div>
              <div className="text-xs text-white font-medium">{userName}</div>
              <a href="/api/auth/signout" className="text-[10px] text-white/30 hover:text-white/60">ログアウト</a>
            </div>
          </>
        )}
        {!userName && (
          <a href="/api/auth/signout" className="text-[10px] text-white/30 hover:text-white/60">ログアウト</a>
        )}
      </div>
    </aside>
  )
}