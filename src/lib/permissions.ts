// 権限判定の共通ヘルパー
// セッションの roles を正として判定する。
// ただし移行期間中、既存ログイン者は roles が空のため role にフォールバックする。

type SessionLike = {
  user?: {
    id?: string
    role?: string
    roles?: string[]
  }
} | null | undefined

// 実効ロール配列を取り出す（roles優先、無ければroleから復元）
export function getRoles(session: SessionLike): string[] {
  const roles = session?.user?.roles
  if (Array.isArray(roles) && roles.length > 0) return roles
  const single = session?.user?.role
  return single ? [single] : []
}

// 特定ロールを持つか
export function hasRole(session: SessionLike, role: string): boolean {
  return getRoles(session).includes(role)
}

// 管理者か
export function isAdmin(session: SessionLike): boolean {
  return hasRole(session, "admin")
}

// 営業か
export function isSales(session: SessionLike): boolean {
  return hasRole(session, "sales")
}

// 制作か
export function isProduction(session: SessionLike): boolean {
  return hasRole(session, "production")
}

// マーケターか
export function isMarketer(session: SessionLike): boolean {
  return hasRole(session, "marketer")
}

// キャリアアドバイザーか
export function isAdvisor(session: SessionLike): boolean {
  return hasRole(session, "advisor")
}

// ===== 機能単位の判定 =====

// マーケ分析画面を見られるか
export function canViewMarketing(session: SessionLike): boolean {
  return isMarketer(session) || isAdmin(session)
}

// CSVインポート系を使えるか
export function canImportData(session: SessionLike): boolean {
  return isMarketer(session) || isAdmin(session)
}

// ユーザー管理を使えるか
export function canManageUsers(session: SessionLike): boolean {
  return isAdmin(session)
}

// 企業を新規追加できるか
export function canCreateCompany(session: SessionLike): boolean {
  return isSales(session) || isAdmin(session)
}

// その企業を「全項目」編集できるか
export function canEditCompanyFull(session: SessionLike, companyUserId: string): boolean {
  if (isAdmin(session)) return true
  // 営業は自分の担当企業のみ
  if (isSales(session) && session?.user?.id === companyUserId) return true
  return false
}

// その企業の「人材紹介項目のみ」編集できるか
export function canEditReferralOnly(session: SessionLike, companyUserId: string): boolean {
  // 全項目編集できる人は当然できる
  if (canEditCompanyFull(session, companyUserId)) return true
  // advisor は担当に関係なく紹介項目だけ編集可
  return isAdvisor(session)
}

// その企業を削除できるか
export function canDeleteCompany(session: SessionLike, companyUserId: string): boolean {
  if (isAdmin(session)) return true
  if (isSales(session) && session?.user?.id === companyUserId) return true
  return false
}

// 制作案件を見られるか
export function canViewProduction(session: SessionLike): boolean {
  return isSales(session) || isProduction(session) || isAdmin(session)
}

// 制作案件を起票できるか
export function canCreateTask(session: SessionLike): boolean {
  return isSales(session) || isAdmin(session)
}

// 制作案件の担当割当・ステータス変更ができるか
export function canManageTask(session: SessionLike): boolean {
  return isProduction(session) || isAdmin(session)
}

// 人材紹介フィールドのキー一覧（advisorが編集できる範囲）
export const REFERRAL_FIELDS = [
  "hasReferralContract",
  "referralFees",
  "condWorkSide", "condFemale", "condLgbtq", "condForeign",
  "condSpecialTrain", "condAge64", "condTattoo", "condAccident",
  "condDorm", "condHousingSupport", "condFemaleFacility",
  "condJobChangeLimit", "condGuarantor",
  "condAgeRange", "condRetirementAge", "condIdealPerson",
  "condHiringStandard", "condAppearance", "condMedicalHistory", "condNote",
]