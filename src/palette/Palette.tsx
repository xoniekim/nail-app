import { useRef, useState } from 'react'
import { UNCATEGORIZED, type Nail } from '../store'
import ImageEditor from '../board/ImageEditor'
import { ALL, CategoryChips, askCategoryName, importNails } from './common'

interface Props {
  nails: Nail[]
  categories: string[]
  onNails: (n: Nail[]) => void
  onCategories: (c: string[]) => void
  notify: (msg: string) => void
}

export default function Palette({ nails, categories, onNails, onCategories, notify }: Props) {
  const [filter, setFilter] = useState(ALL)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<Nail | null>(null)
  const [editing, setEditing] = useState<Nail | null>(null)
  const [editTool, setEditTool] = useState<'erase' | 'crop'>('erase')
  const [moving, setMoving] = useState(false)
  const [adding, setAdding] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const shown = filter === ALL ? nails : nails.filter((n) => n.category === filter)
  const isCustom = filter !== ALL && filter !== UNCATEGORIZED

  const addCategory = () => {
    const name = askCategoryName(categories)
    if (name) { onCategories([...categories, name]); setFilter(name) }
  }

  const renameCategory = () => {
    const name = askCategoryName(categories, filter)
    if (!name || name === filter) return
    onCategories(categories.map((c) => (c === filter ? name : c)))
    onNails(nails.map((n) => (n.category === filter ? { ...n, category: name } : n)))
    setFilter(name)
  }

  const deleteCategory = () => {
    const n = nails.filter((x) => x.category === filter).length
    if (!confirm(`'${filter}' 카테고리를 삭제할까요?${n ? ` 안에 있던 네일 ${n}개는 ${UNCATEGORIZED}로 옮겨져요.` : ''}`)) return
    onCategories(categories.filter((c) => c !== filter))
    onNails(nails.map((x) => (x.category === filter ? { ...x, category: UNCATEGORIZED } : x)))
    setFilter(ALL)
  }

  const addPhotos = async (files: FileList) => {
    setAdding(files.length)
    try {
      const category = filter === ALL ? UNCATEGORIZED : filter
      const { nails: added, failed } = await importNails(files, category)
      if (added.length) {
        onNails([...added, ...nails])
        notify(`네일 ${added.length}개를 ${category}에 넣었어요`)
      }
      if (failed) alert(`${failed}장은 불러올 수 없었어요.`)
    } finally {
      setAdding(0)
    }
  }

  const togglePick = (id: string) => {
    setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const exitSelect = () => { setSelecting(false); setPicked(new Set()) }

  const moveTo = (category: string, ids: Set<string>) => {
    onNails(nails.map((n) => (ids.has(n.id) ? { ...n, category } : n)))
    notify(`${ids.size}개를 ${category}(으)로 옮겼어요`)
  }

  const removeIds = (ids: Set<string>) => {
    if (!confirm(`네일 ${ids.size}개를 삭제할까요? 이미 저장한 이달의 아트에는 그대로 남아요.`)) return false
    onNails(nails.filter((n) => !ids.has(n.id)))
    return true
  }

  return (
    <section className="panel">
      <div className="palette-head">
        <h2 className="section-title">팔레트</h2>
        <div className="row-btns">
          {nails.length > 0 && (
            <button className="btn small" onClick={() => (selecting ? exitSelect() : setSelecting(true))}>
              {selecting ? '취소' : '선택'}
            </button>
          )}
          <button className="btn small primary" disabled={adding > 0} onClick={() => fileRef.current?.click()}>
            {adding ? `불러오는 중… (${adding}장)` : '＋ 사진 추가'}
          </button>
        </div>
      </div>

      <CategoryChips nails={nails} categories={categories} value={filter} onChange={setFilter} onAdd={addCategory} />
      {isCustom && (
        <div className="row-btns cat-tools">
          <button className="btn small" onClick={renameCategory}>이름 바꾸기</button>
          <button className="btn small danger" onClick={deleteCategory}>카테고리 삭제</button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty-upload" onClick={() => fileRef.current?.click()}>
          <div className="big-icon">💅</div>
          <h2>{nails.length === 0 ? '네일 사진을 모아보세요' : '이 카테고리는 비어 있어요'}</h2>
          <p>사진을 여러 장 고르면 한 장이 네일 하나로 들어가요.{filter !== ALL && ` (${filter}에 추가)`}</p>
          <button className="btn primary">사진 선택</button>
        </div>
      ) : (
        <div className="nail-grid">
          {shown.map((n) => (
            <button key={n.id} className={`nail-cell ${picked.has(n.id) ? 'picked' : ''}`}
              onClick={() => (selecting ? togglePick(n.id) : setDetail(n))}>
              <img src={n.src} alt="" draggable={false} />
              {selecting && <span className="check">{picked.has(n.id) ? '✓' : ''}</span>}
              {filter === ALL && n.category !== UNCATEGORIZED && <span className="cat-tag">{n.category}</span>}
            </button>
          ))}
        </div>
      )}

      {selecting && (
        <div className="select-bar">
          <span>{picked.size}개 선택</span>
          <button className="btn small" onClick={() => setPicked(new Set(shown.map((n) => n.id)))}>모두</button>
          <button className="btn small" disabled={!picked.size} onClick={() => setMoving(true)}>카테고리 이동</button>
          <button className="btn small danger" disabled={!picked.size}
            onClick={() => { if (removeIds(picked)) exitSelect() }}>삭제</button>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" multiple hidden
        onChange={(e) => { if (e.target.files?.length) addPhotos(e.target.files); e.target.value = '' }} />

      {moving && (
        <CategoryPicker
          categories={categories}
          onCancel={() => setMoving(false)}
          onNew={() => { const n = askCategoryName(categories); if (n) onCategories([...categories, n]); return n }}
          onPick={(c) => { moveTo(c, picked); setMoving(false); exitSelect() }}
        />
      )}

      {detail && !editing && (
        <div className="modal-bg" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="preview checker"><img src={detail.src} alt="" /></div>
            <label className="field">카테고리
              <select value={detail.category} onChange={(e) => {
                const v = e.target.value
                let category = v
                if (v === '__new__') {
                  const n = askCategoryName(categories)
                  if (!n) return
                  onCategories([...categories, n])
                  category = n
                }
                onNails(nails.map((x) => (x.id === detail.id ? { ...x, category } : x)))
                setDetail({ ...detail, category })
              }}>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value={UNCATEGORIZED}>{UNCATEGORIZED}</option>
                <option value="__new__">＋ 새 카테고리…</option>
              </select>
            </label>
            <div className="actions">
              <button className="btn danger" onClick={() => { if (removeIds(new Set([detail.id]))) setDetail(null) }}>삭제</button>
              <button className="btn" onClick={() => { setEditTool('crop'); setEditing(detail) }}>✂️ 자르기</button>
              <button className="btn" onClick={() => { setEditTool('erase'); setEditing(detail) }}>🧽 지우개</button>
              <button className="btn primary" onClick={() => setDetail(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <ImageEditor
          item={editing}
          initialTool={editTool}
          onCancel={() => setEditing(null)}
          onDone={({ src }) => {
            onNails(nails.map((x) => (x.id === editing.id ? { ...x, src } : x)))
            setDetail({ ...editing, src })
            setEditing(null)
          }}
        />
      )}
    </section>
  )
}

/** 카테고리 하나 고르기 (여러 개 이동용) */
export function CategoryPicker({ categories, onCancel, onPick, onNew }: {
  categories: string[]
  onCancel: () => void
  onPick: (c: string) => void
  onNew: () => string | null
}) {
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>어느 카테고리로 옮길까요?</h3>
        <div className="cat-list">
          {[...categories, UNCATEGORIZED].map((c) => (
            <button key={c} className="btn" onClick={() => onPick(c)}>{c}</button>
          ))}
          <button className="btn" onClick={() => { const n = onNew(); if (n) onPick(n) }}>＋ 새 카테고리</button>
        </div>
        <div className="actions"><button className="btn" onClick={onCancel}>취소</button></div>
      </div>
    </div>
  )
}
