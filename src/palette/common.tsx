import { cleanTag, uid, type Nail } from '../store'
import { fileToDataUrl } from '../image'

export const ALL = '__all__' // 필터: 전체
export const NO_TAG = '__none__' // 필터: 태그 없는 네일

/** 지금 필터로 보이는 네일 */
export function filterNails(nails: Nail[], filter: string): Nail[] {
  if (filter === ALL) return nails
  if (filter === NO_TAG) return nails.filter((n) => n.tags.length === 0)
  return nails.filter((n) => n.tags.includes(filter))
}

/** 사진 여러 장 → 팔레트 네일 여러 개 (사진 한 장 = 네일 하나) */
export async function importNails(files: FileList | File[], tags: string[]): Promise<{ nails: Nail[]; failed: number }> {
  const list = [...files].filter((f) => f.type.startsWith('image/'))
  const nails: Nail[] = []
  for (const f of list) {
    try {
      const { src } = await fileToDataUrl(f)
      nails.push({ id: uid(), src, original: src, tags: [...tags], createdAt: Date.now() })
    } catch { /* 읽을 수 없는 파일은 건너뜀 */ }
  }
  return { nails, failed: list.length - nails.length }
}

/** 필터에서 고른 태그 → 새로 넣는 네일에 붙일 태그 */
export const tagsForFilter = (filter: string) => (filter === ALL || filter === NO_TAG ? [] : [filter])

/** 해시태그 필터 칩 */
export function TagChips({ nails, tags, value, onChange, onAdd }: {
  nails: Nail[]
  tags: string[]
  value: string
  onChange: (v: string) => void
  onAdd?: () => void
}) {
  const chips = [
    { id: ALL, label: '전체', n: nails.length },
    ...tags.map((t) => ({ id: t, label: `#${t}`, n: nails.filter((x) => x.tags.includes(t)).length })),
    { id: NO_TAG, label: '태그 없음', n: nails.filter((x) => x.tags.length === 0).length },
  ]
  return (
    <div className="chips-row">
      {chips.map((c) => (
        <button key={c.id} className={`chip ${value === c.id ? 'on' : ''} ${c.id !== ALL && c.id !== NO_TAG ? 'tag' : ''}`}
          onClick={() => onChange(c.id)}>
          {c.label} <span className="chip-n">{c.n}</span>
        </button>
      ))}
      {onAdd && <button className="chip add" onClick={onAdd}>＋ #태그</button>}
    </div>
  )
}

/** 새 해시태그 이름 입력 (중복·빈 값 검사). 앞의 # 은 붙여도 되고 안 붙여도 됨 */
export function askTagName(tags: string[], initial = ''): string | null {
  const raw = prompt('해시태그 이름 (예: 봄, 프렌치, 글리터)', initial ? `#${initial}` : '#')
  if (raw == null) return null
  const name = cleanTag(raw)
  if (!name) return null
  if (tags.includes(name) && name !== initial) {
    alert(`#${name} 은(는) 이미 있어요.`)
    return null
  }
  return name
}

/**
 * 해시태그 켜고 끄기.
 * state: 태그별로 'on'(모두 가짐) / 'some'(일부만) / 'off'
 */
export function TagToggles({ tags, state, onToggle, onNew }: {
  tags: string[]
  state: (t: string) => 'on' | 'some' | 'off'
  onToggle: (t: string) => void
  onNew: () => void
}) {
  return (
    <div className="tag-toggles">
      {tags.map((t) => {
        const s = state(t)
        return (
          <button key={t} className={`chip tag ${s === 'on' ? 'on' : ''} ${s === 'some' ? 'some' : ''}`} onClick={() => onToggle(t)}>
            #{t}{s === 'on' ? ' ✓' : ''}
          </button>
        )
      })}
      <button className="chip add" onClick={onNew}>＋ 새 태그</button>
    </div>
  )
}
