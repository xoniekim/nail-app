import { useRef, useState } from 'react'
import type { Nail } from '../store'
import ImageEditor from '../board/ImageEditor'
import { ALL, NO_TAG, TagChips, TagToggles, askTagName, filterNails, importNails, tagsForFilter } from './common'

interface Props {
  nails: Nail[]
  tags: string[]
  onNails: (n: Nail[]) => void
  onTags: (t: string[]) => void
  notify: (msg: string) => void
}

export default function Palette({ nails, tags, onNails, onTags, notify }: Props) {
  const [filter, setFilter] = useState(ALL)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Nail | null>(null)
  const [editTool, setEditTool] = useState<'erase' | 'crop'>('erase')
  const [tagging, setTagging] = useState(false) // 여러 개 선택 → 해시태그 달기
  const [adding, setAdding] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const shown = filterNails(nails, filter)
  const isTag = filter !== ALL && filter !== NO_TAG
  const detail = nails.find((n) => n.id === detailId) ?? null

  // ── 태그 목록 관리 ──
  const newTag = (): string | null => {
    const name = askTagName(tags)
    if (name) onTags([...tags, name])
    return name
  }

  const renameTag = () => {
    const name = askTagName(tags, filter)
    if (!name || name === filter) return
    onTags(tags.map((t) => (t === filter ? name : t)))
    onNails(nails.map((n) => (n.tags.includes(filter) ? { ...n, tags: n.tags.map((t) => (t === filter ? name : t)) } : n)))
    setFilter(name)
  }

  const deleteTag = () => {
    const n = nails.filter((x) => x.tags.includes(filter)).length
    if (!confirm(`#${filter} 태그를 삭제할까요?${n ? ` 네일 ${n}개에서 이 태그만 빠지고, 네일은 그대로 남아요.` : ''}`)) return
    onTags(tags.filter((t) => t !== filter))
    onNails(nails.map((x) => (x.tags.includes(filter) ? { ...x, tags: x.tags.filter((t) => t !== filter) } : x)))
    setFilter(ALL)
  }

  // ── 네일에 태그 붙이기/빼기 ──
  /** ids 네일 모두에 태그가 있으면 빼고, 아니면 모두에 붙임 */
  const toggleTagOn = (ids: Set<string>, tag: string) => {
    const target = nails.filter((n) => ids.has(n.id))
    const allHave = target.every((n) => n.tags.includes(tag))
    onNails(nails.map((n) => {
      if (!ids.has(n.id)) return n
      const tagsNext = allHave ? n.tags.filter((t) => t !== tag) : n.tags.includes(tag) ? n.tags : [...n.tags, tag]
      return { ...n, tags: tagsNext }
    }))
  }

  const tagState = (ids: Set<string>) => (tag: string) => {
    const target = nails.filter((n) => ids.has(n.id))
    const c = target.filter((n) => n.tags.includes(tag)).length
    return c === 0 ? 'off' : c === target.length ? 'on' : 'some'
  }

  const addNewTagTo = (ids: Set<string>) => {
    const name = newTag()
    if (name) onNails(nails.map((n) => (ids.has(n.id) ? { ...n, tags: [...n.tags, name] } : n)))
  }

  // ── 사진 추가 ──
  const addPhotos = async (files: FileList) => {
    setAdding(files.length)
    try {
      const t = tagsForFilter(filter)
      const { nails: added, failed } = await importNails(files, t)
      if (added.length) {
        onNails([...added, ...nails])
        notify(`네일 ${added.length}개를 넣었어요${t.length ? ` (#${t[0]})` : ''}`)
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

      <TagChips nails={nails} tags={tags} value={filter} onChange={setFilter} onAdd={() => { const n = newTag(); if (n) setFilter(n) }} />
      {isTag && (
        <div className="row-btns cat-tools">
          <button className="btn small" onClick={renameTag}>이름 바꾸기</button>
          <button className="btn small danger" onClick={deleteTag}>#{filter} 삭제</button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty-upload" onClick={() => fileRef.current?.click()}>
          <div className="big-icon">💅</div>
          <h2>{nails.length === 0 ? '네일 사진을 모아보세요' : '여기에 해당하는 네일이 없어요'}</h2>
          <p>사진을 여러 장 고르면 한 장이 네일 하나로 들어가요.{isTag && ` (#${filter} 가 붙어요)`}</p>
          <button className="btn primary">사진 선택</button>
        </div>
      ) : (
        <div className="nail-grid">
          {shown.map((n) => (
            <button key={n.id} className={`nail-cell ${picked.has(n.id) ? 'picked' : ''}`}
              onClick={() => (selecting ? togglePick(n.id) : setDetailId(n.id))}>
              <img src={n.src} alt="" draggable={false} />
              {selecting && <span className="check">{picked.has(n.id) ? '✓' : ''}</span>}
              {n.tags.length > 0 && (
                <span className="cat-tag">{n.tags.slice(0, 2).map((t) => `#${t}`).join(' ')}{n.tags.length > 2 ? ` +${n.tags.length - 2}` : ''}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {selecting && (
        <div className="select-bar">
          <span>{picked.size}개 선택</span>
          <button className="btn small" onClick={() => setPicked(new Set(shown.map((n) => n.id)))}>모두</button>
          <button className="btn small" disabled={!picked.size} onClick={() => setTagging(true)}># 태그</button>
          <button className="btn small danger" disabled={!picked.size}
            onClick={() => { if (removeIds(picked)) exitSelect() }}>삭제</button>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" multiple hidden
        onChange={(e) => { if (e.target.files?.length) addPhotos(e.target.files); e.target.value = '' }} />

      {tagging && (
        <div className="modal-bg" onClick={() => setTagging(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>네일 {picked.size}개 해시태그</h3>
            <p className="hint">누르면 선택한 네일 모두에 붙고, 다시 누르면 모두에서 빠져요. 점선은 일부에만 붙은 태그예요.</p>
            <TagToggles tags={tags} state={tagState(picked)} onToggle={(t) => toggleTagOn(picked, t)} onNew={() => addNewTagTo(picked)} />
            <div className="actions"><button className="btn primary" onClick={() => { setTagging(false); exitSelect() }}>완료</button></div>
          </div>
        </div>
      )}

      {detail && !editing && (
        <div className="modal-bg" onClick={() => setDetailId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="preview checker"><img src={detail.src} alt="" /></div>
            <div className="field">해시태그</div>
            <TagToggles
              tags={tags}
              state={tagState(new Set([detail.id]))}
              onToggle={(t) => toggleTagOn(new Set([detail.id]), t)}
              onNew={() => addNewTagTo(new Set([detail.id]))}
            />
            <div className="actions">
              <button className="btn danger" onClick={() => { if (removeIds(new Set([detail.id]))) setDetailId(null) }}>삭제</button>
              <button className="btn" onClick={() => { setEditTool('crop'); setEditing(detail) }}>✂️ 자르기</button>
              <button className="btn" onClick={() => { setEditTool('erase'); setEditing(detail) }}>🧽 지우개</button>
              <button className="btn primary" onClick={() => setDetailId(null)}>닫기</button>
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
            setEditing(null)
          }}
        />
      )}
    </section>
  )
}
