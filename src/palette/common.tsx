import { UNCATEGORIZED, uid, type Nail } from '../store'
import { fileToDataUrl } from '../image'

export const ALL = '__all__' // 필터: 전체

/** 사진 여러 장 → 팔레트 네일 여러 개 (사진 한 장 = 네일 하나) */
export async function importNails(files: FileList | File[], category: string): Promise<{ nails: Nail[]; failed: number }> {
  const list = [...files].filter((f) => f.type.startsWith('image/'))
  const nails: Nail[] = []
  for (const f of list) {
    try {
      const { src } = await fileToDataUrl(f)
      nails.push({ id: uid(), src, original: src, category, createdAt: Date.now() })
    } catch { /* 읽을 수 없는 파일은 건너뜀 */ }
  }
  return { nails, failed: list.length - nails.length }
}

/** 카테고리 필터 칩 */
export function CategoryChips({ nails, categories, value, onChange, onAdd }: {
  nails: Nail[]
  categories: string[]
  value: string
  onChange: (v: string) => void
  onAdd?: () => void
}) {
  const count = (c: string) => nails.filter((n) => n.category === c).length
  const chips = [
    { id: ALL, label: '전체', n: nails.length },
    ...categories.map((c) => ({ id: c, label: c, n: count(c) })),
    { id: UNCATEGORIZED, label: UNCATEGORIZED, n: count(UNCATEGORIZED) },
  ]
  return (
    <div className="chips-row">
      {chips.map((c) => (
        <button key={c.id} className={`chip ${value === c.id ? 'on' : ''}`} onClick={() => onChange(c.id)}>
          {c.label} <span className="chip-n">{c.n}</span>
        </button>
      ))}
      {onAdd && <button className="chip add" onClick={onAdd}>＋ 카테고리</button>}
    </div>
  )
}

/** 새 카테고리 이름 입력 (중복·빈 값 검사) */
export function askCategoryName(categories: string[], initial = ''): string | null {
  const name = prompt('카테고리 이름', initial)?.trim()
  if (!name) return null
  if (name === UNCATEGORIZED || (categories.includes(name) && name !== initial)) {
    alert('이미 있는 카테고리 이름이에요.')
    return null
  }
  return name
}
