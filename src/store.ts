import { get, set } from 'idb-keyval'

// 아트보드 좌표계 (논리 단위). 화면 크기와 무관하게 이 단위로 저장한다.
export const BOARD_W = 1000
export const BOARD_H = 1333 // 3:4

// ── 팔레트: 네일 하나하나를 모아두는 곳 ──
export const UNCATEGORIZED = '미분류'

export interface Nail {
  id: string
  src: string // 현재 이미지 (지우개 적용 시 투명 PNG)
  original: string // 처음 불러온 이미지
  category: string // UNCATEGORIZED 또는 사용자가 만든 카테고리 이름
  createdAt: number
}

export interface BoardItem {
  id: string
  nailId?: string // 팔레트에서 가져온 네일 (보드의 사진은 복사본이라 팔레트를 바꿔도 영향 없음)
  src: string // 현재 이미지 (지우개 적용 시 투명 PNG)
  original: string // 처음 불러온 이미지 (지우개 되돌리기용)
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
  dirty?: boolean // 마지막 저장 이후 바뀐 게 있는지 (목록에서 "작성 중" 표시용)
}

export interface Art {
  id: string
  title: string
  month: string
  items: BoardItem[]
  image: string // 완성 이미지 PNG dataURL
  createdAt: number
  updatedAt: number
}

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
  return { artId: null, title: defaultTitle(month), month, items: [] }
}

// ── 이전 버전(칸 방식) 데이터 변환 ──
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

/** 예전 형식(누끼·자르기 시절) 네일도 팔레트 네일로 변환 */
export function migrateNail(n: Partial<Nail> & { id: string; src: string }): Nail {
  return {
    id: n.id,
    src: n.src,
    original: n.original ?? n.src,
    category: n.category ?? UNCATEGORIZED,
    createdAt: n.createdAt ?? Date.now(),
  }
}

export const loadNails = async () =>
  ((await get<(Partial<Nail> & { id: string; src: string })[]>('nails')) ?? []).map(migrateNail)
export const saveNails = (nails: Nail[]) => set('nails', nails)

/** 사용자가 만든 카테고리 (순서 유지, 미분류 제외) */
export const loadCategories = async () => (await get<string[]>('categories')) ?? []
export const saveCategories = (c: string[]) => set('categories', c)

export const loadArts = async () => ((await get<LegacyArt[]>('arts')) ?? []).map(migrateArt)
export const saveArts = (arts: Art[]) => set('arts', arts)

export const loadDraft = async (): Promise<Draft> => {
  const d = await get<Partial<Draft>>('draft')
  if (!d || !Array.isArray(d.items)) return newDraft() // 예전 칸 방식 작업본은 새로 시작
  return d as Draft
}
export const saveDraft = (d: Draft) => set('draft', d)
