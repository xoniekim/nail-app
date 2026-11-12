import { useRef, useState } from 'react'
import type { Nail } from '../store'
import { ALL, TagChips, filterNails, importNails, tagsForFilter } from './common'

/** 아트보드에 올릴 네일을 팔레트에서 여러 개 고르기 (누른 순서대로 번호) */
export default function PalettePicker({ nails, tags, onNails, onCancel, onPick }: {
  nails: Nail[]
  tags: string[]
  onNails: (n: Nail[]) => void
  onCancel: () => void
  onPick: (picked: Nail[]) => void
}) {
  const [filter, setFilter] = useState(ALL)
  const [order, setOrder] = useState<string[]>([])
  const [adding, setAdding] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const shown = filterNails(nails, filter)

  const toggle = (id: string) =>
    setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]))

  const importPhotos = async (files: FileList) => {
    setAdding(files.length)
    try {
      const { nails: added, failed } = await importNails(files, tagsForFilter(filter))
      if (added.length) {
        onNails([...added, ...nails])
        setOrder((o) => [...o, ...added.map((n) => n.id)]) // 새로 넣은 사진은 바로 선택
      }
      if (failed) alert(`${failed}장은 불러올 수 없었어요.`)
    } finally {
      setAdding(0)
    }
  }

  return (
    <div className="picker">
      <div className="eraser-top">
        <button className="btn small" onClick={onCancel}>취소</button>
        <b>팔레트에서 고르기</b>
        <button className="btn small primary" disabled={!order.length}
          onClick={() => onPick(order.map((id) => nails.find((n) => n.id === id)!).filter(Boolean))}>
          {order.length ? `${order.length}개 올리기` : '올리기'}
        </button>
      </div>
      <div className="picker-body">
        <TagChips nails={nails} tags={tags} value={filter} onChange={setFilter} />
        <div className="nail-grid">
          <button className="nail-cell import" disabled={adding > 0} onClick={() => fileRef.current?.click()}>
            <span>＋</span>{adding ? '불러오는 중…' : '사진 불러오기'}
          </button>
          {shown.map((n) => {
            const idx = order.indexOf(n.id)
            return (
              <button key={n.id} className={`nail-cell ${idx >= 0 ? 'picked' : ''}`} onClick={() => toggle(n.id)}>
                <img src={n.src} alt="" draggable={false} />
                <span className="check">{idx >= 0 ? idx + 1 : ''}</span>
              </button>
            )
          })}
        </div>
        {nails.length === 0 && <p className="hint">팔레트가 비어 있어요. 사진을 불러오면 팔레트에도 저장돼요.</p>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden
        onChange={(e) => { if (e.target.files?.length) importPhotos(e.target.files); e.target.value = '' }} />
    </div>
  )
}
