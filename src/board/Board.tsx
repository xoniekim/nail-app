import { useLayoutEffect, useRef, useState } from 'react'
import { BOARD_H, BOARD_W, uid, type BoardItem, type Draft, type Nail } from '../store'
import { imageSize } from '../image'
import ImageEditor, { type EditResult } from './ImageEditor'
import PalettePicker from '../palette/PalettePicker'

interface Props {
  draft: Draft
  onChange: (d: Draft) => void
  onSaveArt: () => void
  onBack: () => void
  nails: Nail[]
  categories: string[]
  onNails: (n: Nail[]) => void
}

type GestureMode = 'move' | 'resize' | 'rotate'
type Gesture = {
  mode: GestureMode; id: string; px: number; py: number; orig: BoardItem
  cx: number; cy: number; a0: number // 회전용: 중심 화면좌표, 시작 각도
} | null

const MIN_W = 50 // 논리 단위 최소 폭

/**
 * 편집 결과를 캔버스 네일에 반영.
 * 자르기를 했다면 잘라낸 부분이 화면에서 원래 있던 자리·크기 그대로 남도록 위치와 크기를 바꾼다(회전 포함).
 */
function applyEdit(it: BoardItem, r: EditResult): BoardItem {
  const cx = it.x + it.w / 2, cy = it.y + it.h / 2
  if (r.reset) {
    // 처음 사진으로 되돌린 경우: 폭은 유지하고 결과 비율에 맞춰 높이만 조정
    const h = (it.w * r.h) / r.w
    return { ...it, src: r.src, h, y: cy - h / 2 }
  }
  if (!r.crop) return { ...it, src: r.src }
  const sx = it.w / r.base.w, sy = it.h / r.base.h // 이미지 1px당 논리 단위
  const w = r.crop.w * sx, h = r.crop.h * sy
  // 잘라낸 영역 중심이 원래 이미지 중심에서 얼마나 떨어져 있었는지 → 회전 적용
  const ox = (r.crop.x + r.crop.w / 2 - r.base.w / 2) * sx
  const oy = (r.crop.y + r.crop.h / 2 - r.base.h / 2) * sy
  const t = ((it.rotation ?? 0) * Math.PI) / 180
  const ncx = cx + ox * Math.cos(t) - oy * Math.sin(t)
  const ncy = cy + ox * Math.sin(t) + oy * Math.cos(t)
  return { ...it, src: r.src, w, h, x: ncx - w / 2, y: ncy - h / 2 }
}
// 새로 올린 네일 배치: 한 줄에 5개(조합 하나)씩
const COL_W = 170, COL_GAP = 25, ROW_H = 260

export default function Board({ draft, onChange, onSaveArt, onBack, nails, categories, onNails }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [live, setLive] = useState<BoardItem[] | null>(null) // 드래그 중 임시 상태 (끝나면 저장)
  const [editing, setEditing] = useState<BoardItem | null>(null)
  const [picking, setPicking] = useState(false)
  const [rotating, setRotating] = useState(false) // 회전 중 각도 표시용
  const [k, setK] = useState(1) // 화면px / 논리 단위
  const boardRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture>(null)

  const items = live ?? draft.items
  const sel = items.find((i) => i.id === selected) ?? null

  // 첫 그리기 전에 크기를 재야 사진이 잠깐 크게 보이는 깜빡임이 없음
  useLayoutEffect(() => {
    const el = boardRef.current
    if (!el) return
    setK(el.clientWidth / BOARD_W)
    const ro = new ResizeObserver(() => setK(el.clientWidth / BOARD_W))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const commit = (next: BoardItem[]) => onChange({ ...draft, items: next })

  /** 팔레트에서 고른 네일을 5개씩 한 줄로 차례차례 배치 (겹쳐도 나중에 옮기면 됨) */
  const addNails = async (picked: Nail[]) => {
    const added: BoardItem[] = []
    for (const nail of picked) {
      const { w, h } = await imageSize(nail.src).catch(() => ({ w: 3, h: 4 }))
      const n = draft.items.length + added.length
      const iw = COL_W, ih = (iw * h) / w
      const col = n % 5, row = Math.floor(n / 5) % 5
      added.push({
        id: uid(), nailId: nail.id, src: nail.src, original: nail.original,
        x: COL_GAP + col * (COL_W + COL_GAP), y: COL_GAP + row * ROW_H, w: iw, h: ih,
      })
    }
    if (added.length) {
      commit([...draft.items, ...added])
      setSelected(null)
    }
  }

  // ── 드래그(이동·크기조절·회전) ──
  const start = (e: React.PointerEvent, mode: GestureMode, item: BoardItem) => {
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    setSelected(item.id)
    // 터치한 네일을 맨 위로
    const front = [...draft.items.filter((i) => i.id !== item.id), item]
    setLive(front)
    setRotating(mode === 'rotate')
    // 회전 기준: 네일 중심의 화면 좌표
    const r = boardRef.current!.getBoundingClientRect()
    const cx = r.left + (item.x + item.w / 2) * k, cy = r.top + (item.y + item.h / 2) * k
    gesture.current = {
      mode, id: item.id, px: e.clientX, py: e.clientY, orig: item, cx, cy,
      a0: Math.atan2(e.clientY - cy, e.clientX - cx),
    }
  }

  const move = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g) return
    const dx = (e.clientX - g.px) / k, dy = (e.clientY - g.py) / k
    const o = g.orig
    const rot = o.rotation ?? 0
    let next: BoardItem
    if (g.mode === 'move') {
      next = {
        ...o,
        x: Math.min(BOARD_W - o.w * 0.2, Math.max(-o.w * 0.8, o.x + dx)),
        y: Math.min(BOARD_H - o.h * 0.2, Math.max(-o.h * 0.8, o.y + dy)),
      }
    } else if (g.mode === 'resize') {
      // 회전된 네일 기준 방향으로 끈 거리 계산 → 비율 유지하며 크기 변경, 왼쪽 위 모서리는 고정
      const t = (rot * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t)
      const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos
      const s = Math.max((o.w + lx) / o.w, (o.h + ly) / o.h, MIN_W / o.w)
      const w = o.w * s, h = o.h * s
      const ocx = o.x + o.w / 2, ocy = o.y + o.h / 2
      const tlx = ocx + (-o.w / 2) * cos - (-o.h / 2) * sin
      const tly = ocy + (-o.w / 2) * sin + (-o.h / 2) * cos
      const ncx = tlx + (w / 2) * cos - (h / 2) * sin
      const ncy = tly + (w / 2) * sin + (h / 2) * cos
      next = { ...o, w, h, x: ncx - w / 2, y: ncy - h / 2 }
    } else {
      // 중심을 기준으로 돌리기, 0·90·180·270° 근처(±4°)에서는 딱 맞춰줌
      const a = Math.atan2(e.clientY - g.cy, e.clientX - g.cx)
      let deg = rot + ((a - g.a0) * 180) / Math.PI
      deg = ((deg % 360) + 540) % 360 - 180
      const snap = Math.round(deg / 90) * 90
      if (Math.abs(deg - snap) < 4) deg = snap === 180 ? -180 : snap
      next = { ...o, rotation: deg }
    }
    setLive((cur) => (cur ?? draft.items).map((i) => (i.id === g.id ? next : i)))
  }

  const end = () => {
    if (!gesture.current) return
    gesture.current = null
    setRotating(false)
    if (live) commit(live)
    setLive(null)
  }

  const remove = (id: string) => {
    commit(draft.items.filter((i) => i.id !== id))
    setSelected(null)
  }

  const px = (v: number) => `${v * k}px`
  const box = (it: BoardItem) => ({
    left: px(it.x), top: px(it.y), width: px(it.w), height: px(it.h),
    transform: it.rotation ? `rotate(${it.rotation}deg)` : undefined,
  })

  return (
    <section className="panel">
      <div className="board-head">
        <button className="btn small back-btn" onClick={onBack} aria-label="목록으로">‹ 목록</button>
        <input className="title-input" value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} />
        <button className="btn primary add-btn" onClick={() => setPicking(true)}>＋ 네일</button>
      </div>
      <p className="hint">
        {items.length === 0
          ? '＋를 눌러 팔레트에서 네일을 여러 개 골라 올리세요. 5개씩 한 줄(조합 하나)로 놓여요.'
          : '네일을 끌어서 옮기고, 터치하면 나오는 아이콘으로 ↘ 크기 · ⟳ 회전 · ✎ 편집(지우개·자르기) · × 삭제를 해요.'}
      </p>

      <div className="board-wrap">
        <div
          ref={boardRef}
          className="board"
          onPointerDown={() => setSelected(null)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          {items.map((it) => (
            <img
              key={it.id}
              src={it.src}
              alt=""
              draggable={false}
              className={`board-item ${it.id === selected ? 'on' : ''}`}
              style={box(it)}
              onPointerDown={(e) => start(e, 'move', it)}
            />
          ))}
          {items.length === 0 && (
            <button className="board-empty" onPointerDown={(e) => e.stopPropagation()} onClick={() => setPicking(true)}>
              <span>＋</span>네일 추가
            </button>
          )}
        </div>

        {sel && (
          // 아이콘들도 네일과 같이 회전
          <div className="handles" style={box(sel)}>
            <button className="handle h-edit" aria-label="편집 (지우개·자르기)"
              onPointerDown={(e) => e.stopPropagation()} onClick={() => setEditing(sel)}>✎</button>
            <button className="handle h-del" aria-label="삭제"
              onPointerDown={(e) => e.stopPropagation()} onClick={() => remove(sel.id)}>×</button>
            <div className="handle h-rotate" aria-label="회전" role="button"
              onPointerDown={(e) => start(e, 'rotate', sel)}
              onPointerMove={move} onPointerUp={end} onPointerCancel={end}>⟳</div>
            <div className="handle h-resize" aria-label="크기 조절" role="button"
              onPointerDown={(e) => start(e, 'resize', sel)}
              onPointerMove={move} onPointerUp={end} onPointerCancel={end}>↘</div>
            {rotating && (
              <span className="rot-badge">{Math.round(sel.rotation ?? 0)}°</span>
            )}
          </div>
        )}
      </div>

      <div className="actions">
        <span className="muted">네일 {items.length}개</span>
        <button className="btn primary" onClick={() => { setSelected(null); onSaveArt() }} disabled={items.length === 0}>이달의 아트 저장</button>
      </div>

      {picking && (
        <PalettePicker
          nails={nails}
          categories={categories}
          onNails={onNails}
          onCancel={() => setPicking(false)}
          onPick={(picked) => { setPicking(false); addNails(picked) }}
        />
      )}

      {editing && (
        <ImageEditor
          item={editing}
          onCancel={() => setEditing(null)}
          onDone={(res) => {
            commit(draft.items.map((i) => (i.id === editing.id ? applyEdit(i, res) : i)))
            setEditing(null)
          }}
        />
      )}
    </section>
  )
}
