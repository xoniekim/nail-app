import { useState } from 'react'
import Board from '../board/Board'
import { exportImage, renderBoard } from '../render'
import { defaultTitle, newDraft, uid, type Art, type Draft, type Nail } from '../store'

interface Props {
  arts: Art[]
  onArts: (a: Art[]) => void
  draft: Draft
  onDraft: (d: Draft) => void
  nails: Nail[]
  categories: string[]
  onNails: (n: Nail[]) => void
  notify: (msg: string) => void
}

const monthLabel = (m: string) => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`

/** 이달의 아트 탭: 목록 → 상세 / 수정(캔버스) / 새로 만들기 */
export default function ArtsTab({ arts, onArts, draft, onDraft, nails, categories, onNails, notify }: Props) {
  const [view, setView] = useState<'list' | 'board'>('list')
  const [detail, setDetail] = useState<Art | null>(null)
  const [saving, setSaving] = useState(false)

  const sorted = [...arts].sort((a, b) => b.month.localeCompare(a.month) || b.updatedAt - a.updatedAt)
  const years = [...new Set(sorted.map((a) => a.month.slice(0, 4)))]
  const inProgress = draft.dirty && draft.items.length > 0

  // 작성 중인 걸 버려도 되는지 확인
  const okToDiscard = (exceptArtId?: string) =>
    !inProgress || draft.artId === exceptArtId ||
    confirm('저장하지 않은 작성 중 아트보드가 있어요. 버리고 진행할까요?')

  const startNew = () => {
    if (!okToDiscard()) return
    onDraft(newDraft())
    setView('board')
  }

  const edit = (a: Art) => {
    if (!okToDiscard(a.id)) return
    if (!(inProgress && draft.artId === a.id)) {
      onDraft({ artId: a.id, title: a.title, month: a.month, items: a.items, dirty: false })
    }
    setDetail(null)
    setView('board')
  }

  const remove = (a: Art) => {
    if (!confirm(`${monthLabel(a.month)} 아트를 삭제할까요?`)) return
    onArts(arts.filter((x) => x.id !== a.id))
    if (draft.artId === a.id) onDraft({ ...draft, artId: null })
    setDetail(null)
  }

  if (view === 'board') {
    return (
      <>
        <Board
          draft={draft}
          onChange={(d) => onDraft({ ...d, dirty: true })}
          onSaveArt={() => setSaving(true)}
          onBack={() => setView('list')}
          nails={nails}
          categories={categories}
          onNails={onNails}
        />
        {saving && (
          <SaveArtDialog
            draft={draft}
            arts={arts}
            onClose={() => setSaving(false)}
            onToList={() => { setSaving(false); setView('list') }}
            onSave={async (title, month) => {
              // 한 달에 하나: 같은 달 아트가 있으면 그 자리에 덮어쓰기
              const sameMonth = arts.find((a) => a.month === month)
              const image = await renderBoard(draft.items)
              const now = Date.now()
              const art: Art = {
                id: sameMonth?.id ?? uid(), title, month, items: draft.items, image,
                createdAt: sameMonth?.createdAt ?? now, updatedAt: now,
              }
              onArts([art, ...arts.filter((a) => a.id !== art.id)])
              onDraft({ ...draft, artId: art.id, title, month, dirty: false })
              notify('이달의 아트를 저장했어요')
              return art
            }}
          />
        )}
      </>
    )
  }

  return (
    <section className="panel">
      <div className="palette-head">
        <h2 className="section-title">이달의 아트</h2>
        <button className="btn small primary" onClick={startNew}>＋ 새로 만들기</button>
      </div>

      {inProgress && (
        <button className="draft-card" onClick={() => setView('board')}>
          <span className="draft-dot" />
          <div>
            <b>작성 중인 아트보드</b>
            <span className="muted">{monthLabel(draft.month)} · 네일 {draft.items.length}개 · 아직 저장 안 됨</span>
          </div>
          <span className="draft-go">이어서 하기 ›</span>
        </button>
      )}

      {sorted.length === 0 ? (
        !inProgress && (
          <div className="empty-upload" onClick={startNew}>
            <div className="big-icon">🗓️</div>
            <h2>첫 이달의 아트를 만들어 보세요</h2>
            <p>팔레트의 네일을 골라 한 달에 조합 1~6개를 배치해요.</p>
            <button className="btn primary">＋ 새로 만들기</button>
          </div>
        )
      ) : (
        years.map((y) => (
          <div key={y} className="year-group">
            <h3 className="year-title">{y}년</h3>
            <div className="art-list">
              {sorted.filter((a) => a.month.startsWith(y)).map((a) => (
                <button key={a.id} className="art-card" onClick={() => setDetail(a)}>
                  <img src={a.image} alt={a.title} />
                  <div>
                    <b>{Number(a.month.slice(5))}월</b>
                    <span className="muted">{a.title} · 네일 {a.items.length}개</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      {detail && (
        <div className="modal-bg" onClick={() => setDetail(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <h3>{detail.title}</h3>
            <p className="hint">{monthLabel(detail.month)} · 네일 {detail.items.length}개 · 마지막 수정 {new Date(detail.updatedAt).toLocaleDateString('ko-KR')}</p>
            <img className="art-full" src={detail.image} alt={detail.title} />
            <div className="actions">
              <button className="btn danger" onClick={() => remove(detail)}>삭제</button>
              <button className="btn" onClick={() => exportImage(detail.image, `${detail.title}.png`)}>이미지 저장</button>
              <button className="btn primary" onClick={() => edit(detail)}>수정하기</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function SaveArtDialog({ draft, arts, onClose, onToList, onSave }: {
  draft: Draft
  arts: Art[]
  onClose: () => void
  onToList: () => void
  onSave: (title: string, month: string) => Promise<Art>
}) {
  const [title, setTitle] = useState(draft.title)
  const [month, setMonth] = useState(draft.month)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Art | null>(null)
  const existing = arts.find((a) => a.month === month)
  // 다른 달 아트를 열어 고치다가 이미 저장된 달로 저장하는 경우 → 덮어쓰기 경고
  const overwritesOther = existing && existing.id !== draft.artId

  const save = async () => {
    if (overwritesOther && !confirm(`${monthLabel(month)}에 이미 저장한 아트가 있어요. 지금 아트보드로 바꿀까요?`)) return
    setBusy(true)
    try { setDone(await onSave(title.trim() || defaultTitle(month), month)) } finally { setBusy(false) }
  }

  if (done) {
    return (
      <div className="modal-bg" onClick={onClose}>
        <div className="modal wide" onClick={(e) => e.stopPropagation()}>
          <h3>저장 완료</h3>
          <img className="art-full" src={done.image} alt={done.title} />
          <div className="actions">
            <button className="btn" onClick={onClose}>계속 편집</button>
            <button className="btn" onClick={() => exportImage(done.image, `${done.title}.png`)}>이미지로 내보내기</button>
            <button className="btn primary" onClick={onToList}>목록으로</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>이달의 아트 저장</h3>
        <label className="field">월
          <input type="month" value={month} onChange={(e) => {
            const m = e.target.value
            if (!m) return
            if (title === defaultTitle(month)) setTitle(defaultTitle(m))
            setMonth(m)
          }} />
        </label>
        <label className="field">제목
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {existing && (
          <p className={`hint ${overwritesOther ? 'warn' : ''}`}>
            이 달에는 이미 저장한 아트가 있어서, 저장하면 그 아트가 지금 아트보드로 바뀌어요.
          </p>
        )}
        <div className="actions">
          <button className="btn" onClick={onClose} disabled={busy}>취소</button>
          <button className="btn primary" onClick={save} disabled={busy}>{existing ? '덮어쓰기' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}
