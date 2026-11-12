import { useEffect, useRef, useState } from 'react'

interface View { s: number; tx: number; ty: number }
export interface Rect { x: number; y: number; w: number; h: number }
type Tool = 'erase' | 'crop'
type Ratio = 'free' | '1:1' | '3:4'
type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'move'
const CROP_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const

/** 편집 결과. 캔버스에서는 crop 정보로 자른 부분이 제자리에 남도록 위치·크기를 맞춘다. */
export interface EditResult {
  src: string
  w: number // 결과 이미지 픽셀 크기
  h: number
  base: { w: number; h: number } // crop 좌표의 기준 이미지 크기
  crop: Rect | null // 기준 이미지에서 잘라낸 영역 (자르지 않았으면 null)
  reset: boolean // "원본으로" 되돌렸는지 (기준이 처음 사진으로 바뀜)
}

interface UndoEntry { data: ImageData; cum: Rect }

const MAX_UNDO = 20
const MIN_CROP = 16 // 이미지 px
const RATIOS: Record<Ratio, number | null> = { free: null, '1:1': 1, '3:4': 3 / 4 }

/**
 * 이미지 편집 화면 (지우개 · 자르기)
 * - 지우개: 한 손가락/마우스로 지우기, 두 손가락으로 이동·확대, 데스크톱은 휠로 확대
 * - 자르기: 틀의 모서리를 끌어 크기, 안쪽을 끌어 위치 조절 → 자르기
 */
export default function ImageEditor({ item, onCancel, onDone, initialTool = 'erase' }: {
  item: { src: string; original: string } // 팔레트 네일·캔버스 네일 공용
  onCancel: () => void
  onDone: (r: EditResult) => void
  initialTool?: Tool
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [tool, setTool] = useState<Tool>(initialTool)
  const [size, setSize] = useState(24) // 화면 기준 브러시 지름(px)
  const [view, setView] = useState<View>({ s: 1, tx: 0, ty: 0 })
  const [fit, setFit] = useState(1)
  const [dims, setDims] = useState({ w: 0, h: 0 }) // 현재 캔버스 크기
  const [cropRect, setCropRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 })
  const [ratio, setRatio] = useState<Ratio>('free')
  const [canUndo, setCanUndo] = useState(false)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const undo = useRef<UndoEntry[]>([])
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const last = useRef<{ x: number; y: number } | null>(null)
  const cropDrag = useRef<{ h: Handle; px: number; py: number; r: Rect } | null>(null)
  const dirty = useRef(false)
  const base = useRef({ w: 0, h: 0 })
  const cum = useRef<Rect>({ x: 0, y: 0, w: 0, h: 0 }) // 기준 이미지에서 지금까지 잘라낸 영역
  const reset = useRef(false)

  const fitView = (w: number, h: number) => {
    const stage = stageRef.current!
    const f = Math.min(stage.clientWidth / w, stage.clientHeight / h) * 0.86
    setFit(f)
    setView({ s: f, tx: (stage.clientWidth - w * f) / 2, ty: (stage.clientHeight - h * f) / 2 })
  }

  // 비율에 맞는, 가운데 놓인 가장 큰 자르기 틀
  const initialCrop = (w: number, h: number, r: Ratio): Rect => {
    const k = RATIOS[r]
    if (!k) return { x: 0, y: 0, w, h }
    let cw = w, ch = w / k
    if (ch > h) { ch = h; cw = h * k }
    return { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch }
  }

  const syncDims = (w: number, h: number) => {
    setDims({ w, h })
    setCropRect(initialCrop(w, h, ratio))
    fitView(w, h)
  }

  // 이미지 불러와 캔버스에 그리기
  const load = (src: string, asBase: boolean) => {
    const img = new Image()
    img.onload = () => {
      const c = canvasRef.current!
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d')!
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0)
      undo.current = []
      setCanUndo(false)
      if (asBase) {
        base.current = { w: c.width, h: c.height }
        cum.current = { x: 0, y: 0, w: c.width, h: c.height }
      }
      syncDims(c.width, c.height)
    }
    img.src = src
  }

  useEffect(() => { load(item.src, true) }, [item.src]) // eslint-disable-line react-hooks/exhaustive-deps

  const local = (e: { clientX: number; clientY: number }) => {
    const r = stageRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const toImg = (p: { x: number; y: number }) => ({ x: (p.x - view.tx) / view.s, y: (p.y - view.ty) / view.s })

  const pushUndo = () => {
    const c = canvasRef.current!
    undo.current.push({ data: c.getContext('2d')!.getImageData(0, 0, c.width, c.height), cum: { ...cum.current } })
    if (undo.current.length > MAX_UNDO) undo.current.shift()
    setCanUndo(true)
  }

  // ── 지우개 ──
  const erase = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = size / view.s
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x + 0.01, b.y)
    ctx.stroke()
    ctx.restore()
    dirty.current = true
  }

  const zoomAt = (factor: number, cx: number, cy: number) => {
    setView((v) => {
      const s = Math.min(Math.max(v.s * factor, fit * 0.5), fit * 12)
      const r = s / v.s
      return { s, tx: cx - (cx - v.tx) * r, ty: cy - (cy - v.ty) * r }
    })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (tool !== 'erase') return
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    if (pointers.current.size === 1) {
      pushUndo()
      const ip = toImg(p)
      erase(ip, ip)
      last.current = ip
    } else {
      // 두 번째 손가락이 닿으면 방금 시작한 지우기를 취소하고 이동·확대 모드로
      if (last.current) {
        const prev = undo.current.pop()
        if (prev) canvasRef.current!.getContext('2d')!.putImageData(prev.data, 0, 0)
        setCanUndo(undo.current.length > 0)
      }
      last.current = null
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const p = local(e)
    if (tool === 'erase' && e.pointerType === 'mouse') setCursor(p)
    if (tool === 'crop') { moveCrop(e); return }
    const map = pointers.current
    const prev = map.get(e.pointerId)
    if (!prev) return
    if (map.size === 1 && last.current) {
      const ip = toImg(p)
      erase(last.current, ip)
      last.current = ip
    } else if (map.size === 2) {
      const other = [...map.entries()].find(([id]) => id !== e.pointerId)![1]
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y)
      const d1 = Math.hypot(p.x - other.x, p.y - other.y)
      const m0 = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 }
      const m1 = { x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 }
      setView((v) => {
        const s = Math.min(Math.max(v.s * (d0 ? d1 / d0 : 1), fit * 0.5), fit * 12)
        const r = s / v.s
        return { s, tx: m1.x - (m0.x - v.tx) * r, ty: m1.y - (m0.y - v.ty) * r }
      })
    }
    map.set(e.pointerId, p)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) last.current = null
    cropDrag.current = null
  }

  const onWheel = (e: React.WheelEvent) => {
    if (tool !== 'erase') return
    const p = local(e)
    if (e.ctrlKey || e.deltaMode !== 0 || (Math.abs(e.deltaY) >= 50 && e.deltaX === 0)) {
      zoomAt(Math.exp(Math.max(-300, Math.min(300, -e.deltaY)) * (e.ctrlKey ? 0.01 : 0.003)), p.x, p.y)
    } else {
      setView((v) => ({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }))
    }
  }

  // ── 자르기 ──
  const startCrop = (e: React.PointerEvent, h: Handle) => {
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    cropDrag.current = { h, px: e.clientX, py: e.clientY, r: cropRect }
  }

  const moveCrop = (e: React.PointerEvent) => {
    const d = cropDrag.current
    if (!d) return
    const dx = (e.clientX - d.px) / view.s, dy = (e.clientY - d.py) / view.s
    const { w: W, h: H } = dims
    const o = d.r
    if (d.h === 'move') {
      setCropRect({ ...o, x: Math.min(W - o.w, Math.max(0, o.x + dx)), y: Math.min(H - o.h, Math.max(0, o.y + dy)) })
      return
    }
    // 끄는 핸들이 움직이는 변: 모서리는 두 변, 상하좌우 핸들은 한 변. 반대쪽 변은 고정
    const L = d.h.includes('w'), R = d.h.includes('e'), T = d.h.includes('n'), B = d.h.includes('s')
    let x0 = o.x, x1 = o.x + o.w, y0 = o.y, y1 = o.y + o.h
    if (L) x0 = Math.min(Math.max(0, x0 + dx), x1 - MIN_CROP)
    if (R) x1 = Math.max(Math.min(W, x1 + dx), x0 + MIN_CROP)
    if (T) y0 = Math.min(Math.max(0, y0 + dy), y1 - MIN_CROP)
    if (B) y1 = Math.max(Math.min(H, y1 + dy), y0 + MIN_CROP)
    let w = x1 - x0, h = y1 - y0
    const k = RATIOS[ratio]
    if (k) {
      const horiz = L || R, vert = T || B
      if (horiz && vert) { if (w / h > k) w = h * k; else h = w / k } // 모서리: 더 많이 끈 쪽 기준
      else if (horiz) { h = w / k; if (h > H) { h = H; w = h * k } } // 좌우 변: 높이를 비율에 맞춤
      else { w = h * k; if (w > W) { w = W; h = w / k } } // 상하 변: 폭을 비율에 맞춤
      // 고정된 변 기준으로 다시 놓고, 안 움직이는 축은 가운데 유지
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2
      x0 = L ? x1 - w : R ? x0 : cx - w / 2
      y0 = T ? y1 - h : B ? y0 : cy - h / 2
      x0 = Math.min(Math.max(0, x0), W - w)
      y0 = Math.min(Math.max(0, y0), H - h)
    }
    setCropRect({ x: x0, y: y0, w, h })
  }

  const changeRatio = (r: Ratio) => {
    setRatio(r)
    setCropRect(initialCrop(dims.w, dims.h, r))
  }

  const cropChanged = () =>
    Math.round(cropRect.x) !== 0 || Math.round(cropRect.y) !== 0 ||
    Math.round(cropRect.w) !== dims.w || Math.round(cropRect.h) !== dims.h

  const applyCrop = () => {
    if (!cropChanged()) return
    const c = canvasRef.current!
    const r = {
      x: Math.round(cropRect.x), y: Math.round(cropRect.y),
      w: Math.max(1, Math.round(cropRect.w)), h: Math.max(1, Math.round(cropRect.h)),
    }
    pushUndo()
    const data = c.getContext('2d')!.getImageData(r.x, r.y, r.w, r.h)
    c.width = r.w
    c.height = r.h
    c.getContext('2d')!.putImageData(data, 0, 0)
    cum.current = { x: cum.current.x + r.x, y: cum.current.y + r.y, w: r.w, h: r.h }
    dirty.current = true
    syncDims(r.w, r.h)
  }

  // ── 공통 ──
  const doUndo = () => {
    const prev = undo.current.pop()
    if (prev) {
      const c = canvasRef.current!
      const sizeChanged = c.width !== prev.data.width || c.height !== prev.data.height
      c.width = prev.data.width
      c.height = prev.data.height
      c.getContext('2d')!.putImageData(prev.data, 0, 0)
      cum.current = prev.cum
      dirty.current = true
      if (sizeChanged) syncDims(c.width, c.height)
    }
    setCanUndo(undo.current.length > 0)
  }

  const restoreOriginal = () => {
    if (!confirm('지우고 자른 것을 모두 되돌려 처음 사진으로 돌아갈까요?')) return
    dirty.current = true
    reset.current = true
    load(item.original, true)
  }

  const done = () => {
    if (tool === 'crop' && cropChanged()) applyCrop() // 자르기 틀을 바꿔둔 채 완료하면 적용
    if (!dirty.current) { onCancel(); return }
    const c = canvasRef.current!
    const full = cum.current.x === 0 && cum.current.y === 0 && cum.current.w === base.current.w && cum.current.h === base.current.h
    onDone({
      src: c.toDataURL('image/png'),
      w: c.width,
      h: c.height,
      base: base.current,
      crop: full ? null : { ...cum.current },
      reset: reset.current,
    })
  }

  const switchTool = (t: Tool) => {
    if (t === tool) return
    if (tool === 'crop' && cropChanged() && confirm('조절한 자르기 틀을 적용할까요?')) applyCrop()
    setTool(t)
    setCursor(null)
    if (t === 'crop') { setCropRect(initialCrop(dims.w, dims.h, ratio)); fitView(dims.w, dims.h) }
  }

  // 자르기 틀의 화면 좌표
  const cr = {
    left: view.tx + cropRect.x * view.s, top: view.ty + cropRect.y * view.s,
    width: cropRect.w * view.s, height: cropRect.h * view.s,
  }

  return (
    <div className="eraser">
      <div className="eraser-top">
        <button className="btn small" onClick={onCancel}>취소</button>
        <div className="seg">
          <button className={tool === 'erase' ? 'on' : ''} onClick={() => switchTool('erase')}>🧽 지우개</button>
          <button className={tool === 'crop' ? 'on' : ''} onClick={() => switchTool('crop')}>✂️ 자르기</button>
        </div>
        <button className="btn small primary" onClick={done}>완료</button>
      </div>

      <div
        ref={stageRef}
        className={`eraser-stage checker ${tool === 'crop' ? 'crop-mode' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        onWheel={onWheel}
      >
        <canvas ref={canvasRef} style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})` }} />
        {tool === 'erase' && cursor && (
          <div className="brush-cursor" style={{ left: cursor.x, top: cursor.y, width: size, height: size }} />
        )}
        {tool === 'crop' && dims.w > 0 && (
          <div className="crop-box" style={cr} onPointerDown={(e) => startCrop(e, 'move')}>
            <div className="crop-lines" />
            {CROP_HANDLES.map((h) => (
              <div key={h} className={`crop-h ${h}`} onPointerDown={(e) => startCrop(e, h)} />
            ))}
          </div>
        )}
      </div>

      <div className="eraser-bottom">
        {tool === 'erase' ? (
          <>
            <p className="hint">한 손가락으로 문질러 지우고, 두 손가락으로 옮기거나 확대하세요.</p>
            <label className="eraser-size">크기
              <input type="range" min={6} max={90} value={size} onChange={(e) => setSize(+e.target.value)} />
              <span className="size-dot" style={{ width: size / 2, height: size / 2 }} />
            </label>
          </>
        ) : (
          <>
            <p className="hint">모서리를 끌어 크기를, 안쪽을 끌어 위치를 정한 뒤 자르기를 누르세요.</p>
            <div className="row-btns">
              {(['free', '1:1', '3:4'] as const).map((r) => (
                <button key={r} className={`chip ${ratio === r ? 'on' : ''}`} onClick={() => changeRatio(r)}>
                  {r === 'free' ? '자유' : r}
                </button>
              ))}
              <span className="muted crop-size">{Math.round(cropRect.w)} × {Math.round(cropRect.h)}</span>
            </div>
          </>
        )}
        <div className="actions">
          <button className="btn" onClick={restoreOriginal}>원본으로</button>
          {tool === 'erase' ? (
            <>
              <button className="btn" onClick={() => zoomAt(1 / 1.4, stageRef.current!.clientWidth / 2, stageRef.current!.clientHeight / 2)}>－</button>
              <button className="btn" onClick={() => zoomAt(1.4, stageRef.current!.clientWidth / 2, stageRef.current!.clientHeight / 2)}>＋</button>
            </>
          ) : (
            <button className="btn primary" onClick={applyCrop} disabled={!cropChanged()}>✂️ 자르기</button>
          )}
          <button className="btn" onClick={doUndo} disabled={!canUndo}>↶ 되돌리기</button>
        </div>
      </div>
    </div>
  )
}
