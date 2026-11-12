import { useLayoutEffect, useRef, useState } from 'react'
import { BOARD_W, bgOf, boardHOf, uid, type BoardItem, type Draft, type Nail } from '../store'
import { imageSize } from '../image'
import ImageEditor, { type EditResult } from './ImageEditor'
import PalettePicker from '../palette/PalettePicker'

interface Props {
  draft: Draft
  onChange: (d: Draft) => void
  onSaveArt: () => void
  onBack: () => void
  nails: Nail[]
  tags: string[]
  onNails: (n: Nail[]) => void
}

type GestureMode = 'move' | 'resize' | 'rotate'
type Gesture = {
  mode: GestureMode; id: string; px: number; py: number; orig: BoardItem
  cx: number; cy: number; a0: number // 회전용: 중심 화면좌표, 시작 각도
} | null

const MIN_W = 50 // 논리 단위 최소 폭
// 새 아트보드 높이 범위 (폭 1000 기준) — 화면 비율을 따르되 너무 극단적이지 않게
const MIN_BOARD_H = 500, MAX_BOARD_H = 2400
// 배경색 추천
const BG_COLORS = ['#ffffff', '#fdf7f8', '#f8e1e7', '#ead7f5', '#dcecfb', '#dff3ea', '#f3e9dc', '#e9e9e9', '#222222']

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

export default function Board({ draft, onChange, onSaveArt, onBack, nails, tags, onNails }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [live, setLive] = useState<BoardItem[] | null>(null) // 드래그 중 임시 상태 (끝나면 저장)
  const [editing, setEditing] = useState<BoardItem | null>(null)
  const [picking, setPicking] = useState(false)
  const [bgOpen, setBgOpen] = useState(false)
  const [rotating, setRotating] = useState(false) // 회전 중 각도 표시용
  const [area, setArea] = useState({ w: 0, h: 0 }) // 아트보드가 쓸 수 있는 화면 영역
  const areaRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture>(null)

  const items = live ?? draft.items
  const sel = items.find((i) => i.id === selected) ?? null
  const boardH = boardHOf(draft)
  const bg = bgOf(draft)
  // 화면px / 논리 단위: 영역 안에 보드가 꽉 차도록
  const k = area.w ? Math.min(area.w / BOARD_W, area.h / boardH) : 0

  // 첫 그리기 전에 영역을 재야 깜빡임이 없음
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    const measure = () => setArea({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 아직 아무것도 없는 새 아트보드는 지금 화면 비율에 맞춰 상하좌우 꽉 차게
  const isFresh = draft.items.length === 0 && !draft.artId
  useLayoutEffect(() => {
    if (!isFresh || !area.w || !area.h) return
    const h = Math.round(Math.min(MAX_BOARD_H, Math.max(MIN_BOARD_H, (BOARD_W * area.h) / area.w)))
    if (Math.abs(h - boardH) > 4) onChange({ ...draft, boardH: h })
  }, [isFresh, area.w, area.h]) // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: BoardItem[]) => onChange({ ...draft, items: next })

  /** 팔레트에서 고른 네일을 5개씩 한 줄로 차례차례 배치 (겹쳐도 나중에 옮기면 됨) */
  const addNails = async (picked: Nail[]) => {
    const added: BoardItem[] = []
    const rows = Math.max(1, Math.floor((boardH - COL_GAP) / ROW_H))
    for (const nail of picked) {
      const { w, h } = await imageSize(nail.src).catch(() => ({ w: 3, h: 4 }))
      const n = draft.items.length + added.length
      const iw = COL_W, ih = (iw * h) / w
      const col = n % 5, row = Math.floor(n / 5) % rows
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
    setBgOpen(false)
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
        y: Math.min(boardH - o.h * 0.2, Math.max(-o.h * 0.8, o.y + dy)),
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
    <section className="board-screen">
      <div className="board-bar">
        <button className="btn small back-btn" onClick={onBack} aria-label="목록으로">‹ 목록</button>
        <input className="title-input" value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} />
        <button className="btn small primary" onClick={() => { setSelected(null); onSaveArt() }} disabled={items.length === 0}>저장</button>
      </div>
      <div className="board-tools">
        <button className="btn small primary" onClick={() => { setBgOpen(false); setPicking(true) }}>＋ 네일</button>
        <button className={`btn small bg-btn ${bgOpen ? 'on' : ''}`} onClick={() => setBgOpen((v) => !v)}>
          <span className="swatch" style={{ background: bg }} />배경
        </button>
        <span className="muted">네일 {items.length}개</span>
      </div>
      {bgOpen && (
        <div className="bg-pop">
          {BG_COLORS.map((c) => (
            <button key={c} className={`swatch big ${bg.toLowerCase() === c ? 'on' : ''}`} style={{ background: c }}
              aria-label={`배경 ${c}`} onClick={() => onChange({ ...draft, bg: c })} />
          ))}
          <label className="swatch big custom" title="직접 고르기" style={{ background: BG_COLORS.includes(bg.toLowerCase()) ? undefined : bg }}>
            <input type="color" value={bg} onChange={(e) => onChange({ ...draft, bg: e.target.value })} />
            {BG_COLORS.includes(bg.toLowerCase()) && <span>＋</span>}
          </label>
        </div>
      )}

      <div className="board-area" ref={areaRef}>
        {k > 0 && (
          <div className="board-wrap" style={{ width: BOARD_W * k, height: boardH * k }}>
            <div
              ref={boardRef}
              className="board"
              style={{ background: bg }}
              onPointerDown={() => { setSelected(null); setBgOpen(false) }}
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
                  <small>팔레트에서 여러 개 골라 올려요. 5개씩 한 줄(조합 하나)로 놓이고, 터치하면 크기·회전·편집 아이콘이 나와요.</small>
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
        )}
      </div>

      {picking && (
        <PalettePicker
          nails={nails}
          tags={tags}
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
