import { get, set } from 'idb-keyval'

// 아트보드 좌표계 (논리 단위). 폭은 항상 1000, 높이는 아트마다 다름(만들 때 화면 비율에 맞춤).
export const BOARD_W = 1000
export const DEFAULT_BOARD_H = 1333 // 3:4 (예전 아트 기본값)
export const DEFAULT_BG = '#ffffff'

// ── 팔레트: 네일 하나하나를 모아두는 곳 ──
export interface Nail {
  id: string
  src: string // 현재 이미지 (지우개·자르기 적용 결과)
  original: string // 처음 불러온 이미지
  tags: string[] // 해시태그 (# 없이 저장). 여러 개 가능
  createdAt: number
}

export interface BoardItem {
  id: string
  nailId?: string // 팔레트에서 가져온 네일 (보드의 사진은 복사본이라 팔레트를 바꿔도 영향 없음)
  src: string
  original: string
  x: number
  y: number
  w: number
  h: number
  rotation?: number // 도(°), 중심 기준 시계방향
}

export interface Draft {
  artId: string | null
  title: string
  month: string // YYYY-MM
  items: BoardItem[] // 뒤에 있을수록 위에 그려짐
  bg?: string // 배경색
  boardH?: number // 논리 높이 (폭 1000 기준)
  dirty?: boolean // 마지막 저장 이후 바뀐 게 있는지 (목록에서 "작성 중" 표시용)
}

export interface Art {
  id: string
  title: string
  month: string
  items: BoardItem[]
  bg?: string
  boardH?: number
  image: string // 완성 이미지 PNG dataURL
  createdAt: number
  updatedAt: number
}

export const boardHOf = (d: { boardH?: number }) => d.boardH ?? DEFAULT_BOARD_H
export const bgOf = (d: { bg?: string }) => d.bg ?? DEFAULT_BG

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function defaultTitle(month: string): string {
  const [y, m] = month.split('-')
  return `${y}년 ${Number(m)}월 이달의 아트`
}

export function newDraft(): Draft {
  const month = currentMonth()
  return { artId: null, title: defaultTitle(month), month, items: [], bg: DEFAULT_BG }
}

/** 해시태그 이름 정리: 앞의 #, 앞뒤 공백 제거, 중간 공백은 _ 로 */
export function cleanTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').trim().replace(/\s+/g, '_')
}

// ── 예전 버전 데이터 변환 ──
interface LegacySlotNail { id: string; src: string }
type LegacyArt = Omit<Art, 'items'> & { items?: BoardItem[]; slots?: (LegacySlotNail | null)[] }

/** 칸 방식으로 저장된 아트를 5열 배치의 아트보드 아이템으로 변환 */
function slotsToItems(slots: (LegacySlotNail | null)[]): BoardItem[] {
  const gap = 10, w = (BOARD_W - gap * 6) / 5, h = (w * 4) / 3
  return slots.flatMap((s, i) => s ? [{
    id: uid(), src: s.src, original: s.src,
    x: gap + (i % 5) * (w + gap), y: gap + Math.floor(i / 5) * (h + gap), w, h,
  }] : [])
}

export function migrateArt(a: LegacyArt): Art {
  if (Array.isArray(a.items)) return a as Art
  const { slots, ...rest } = a
  return { ...rest, items: slotsToItems(slots ?? []) }
}

type LegacyNail = Partial<Nail> & { id: string; src: string; category?: string }

/** 예전 네일(카테고리 하나) → 해시태그 네일. '미분류'는 태그 없음으로 */
export function migrateNail(n: LegacyNail): Nail {
  const tags = Array.isArray(n.tags)
    ? n.tags
    : n.category && n.category !== '미분류' ? [cleanTag(n.category)] : []
  return { id: n.id, src: n.src, original: n.original ?? n.src, tags, createdAt: n.createdAt ?? Date.now() }
}

export const loadNails = async () => ((await get<LegacyNail[]>('nails')) ?? []).map(migrateNail)
export const saveNails = (nails: Nail[]) => set('nails', nails)

/** 해시태그 목록 (순서 유지). 예전 카테고리 목록이 있으면 그대로 태그로 가져옴 */
export const loadTags = async () =>
  (await get<string[]>('tags')) ?? ((await get<string[]>('categories')) ?? []).map(cleanTag)
export const saveTags = (t: string[]) => set('tags', t)

export const loadArts = async () => ((await get<LegacyArt[]>('arts')) ?? []).map(migrateArt)
export const saveArts = (arts: Art[]) => set('arts', arts)

export const loadDraft = async (): Promise<Draft> => {
  const d = await get<Partial<Draft>>('draft')
  if (!d || !Array.isArray(d.items)) return newDraft() // 예전 칸 방식 작업본은 새로 시작
  return d as Draft
}
export const saveDraft = (d: Draft) => set('draft', d)
