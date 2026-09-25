// 置き場所: src/components/Sidebar.tsx
"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

type Link = { href: string; label: string }
type Section = { title: string; links: Link[] }

export default function Sidebar({ userName }: { userName?: string }) {
  const pathname = usePathname()
  const [roles, setRoles] = useState<string[]>([])
  const [agencyId, setAgencyId] = useState<string | null>(null)
  const [unassignedCount, setUnassignedCount] = useState(0)

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => {
      const rs = s?.user?.roles
      if (Array.isArray(rs) && rs.length > 0) setRoles(rs)
      else if (s?.user?.role) setRoles([s.user.role])
      else setRoles([])
      setAgencyId(s?.user?.agencyId ?? null)
    })
    fetch("/api/production-tasks").then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        setUnassignedCount(data.filter(t => !t.assignee).length)
      }
    })
  }, [])

  // 代理店ユーザー（agencyId あり）は制作・マーケ系を一切表示しない
  const isAgency = !!agencyId

  const isSales = roles.includes("sales")
  const isProduction = roles.includes("production")
  const isMarketer = roles.includes("marketer")
  const isAdmin = roles.includes("admin")

  const canSales = isSales || isAdmin
  const canProduction = !isAgency && (isProduction || isAdmin)
  const canMarketer = !isAgency && (isMarketer || isAdmin)
  const canAdmin = !isAgency && isAdmin

  const sections: Section[] = [
    {
      title: "メニュー",
      links: [
        { href: "/dashboard", label: "📊 ダッシュボード" },
        { href: "/companies", label: "🏢 企業一覧" },
        ...(canSales ? [{ href: "/companies/new", label: "➕ 企業追加" }] : []),
        ...(canProduction ? [{ href: "/production", label: "🎨 制作ダッシュボード" }] : []),
      ],
    },
    {
      title: "分析",
      links: canMarketer ? [
        { href: "/marketing", label: "📊 マーケ分析" },
        { href: "/marketing/trend", label: "📈 月次トレンド" },
        { href: "/marketing/budget", label: "🎯 かけて良い広告費" },
      ] : [],
    },
    {
      title: "データ管理",
      links: [
        ...(canMarketer ? [
          { href: "/import/applications", label: "📥 応募明細インポート" },
          { href: "/import/articles", label: "📰 記事インポート" },
          { href: "/import/ad-costs", label: "💰 広告費インポート" },
          { href: "/companies/import-hearing", label: "📋 ヒアリングインポート" },
        ] : []),
        ...(canAdmin ? [{ href: "/users", label: "👥 ユーザー管理" }] : []),
      ],
    },
  ].filter(s => s.links.length > 0)

  const exactOnly = ["/companies", "/marketing"]

  return (
    <aside className="w-48 min-w-48 bg-[#0C1A2E] flex flex-col">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="text-sm font-semibold text-white">🚕 転職道</div>
        <div className="text-xs text-white/30 mt-0.5">営業DB</div>
      </div>
      <nav className="flex-1 py-4 overflow-y-auto">
        {sections.map((section, si) => (
          <div key={section.title} className={si > 0 ? "mt-5" : ""}>
            <div className="px-5 pb-2 text-[10px] text-white/25 uppercase tracking-widest">{section.title}</div>
            {section.links.map(link => {
              const isActive = pathname === link.href || (exactOnly.includes(link.href) ? false : pathname.startsWith(link.href + "/"))
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
          </div>
        ))}
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
