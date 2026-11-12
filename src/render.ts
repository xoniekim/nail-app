import { BOARD_H, BOARD_W, type BoardItem } from './store'

const OUT_W = 1500 // 저장 이미지 폭(px)

const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = rej
    i.src = src
  })

/** 아트보드를 화면에 보이는 그대로 한 장의 PNG로 */
export async function renderBoard(items: BoardItem[]): Promise<string> {
  const k = OUT_W / BOARD_W
  const c = document.createElement('canvas')
  c.width = OUT_W
  c.height = Math.round(BOARD_H * k)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.imageSmoothingQuality = 'high'
  const imgs = await Promise.all(items.map((i) => loadImg(i.src)))
  items.forEach((it, n) => {
    ctx.save()
    ctx.translate((it.x + it.w / 2) * k, (it.y + it.h / 2) * k)
    if (it.rotation) ctx.rotate((it.rotation * Math.PI) / 180)
    ctx.drawImage(imgs[n], (-it.w / 2) * k, (-it.h / 2) * k, it.w * k, it.h * k)
    ctx.restore()
  })
  return c.toDataURL('image/png')
}

/** 모바일은 공유 시트(사진 앱 저장 가능), 데스크톱은 파일 다운로드 */
export async function exportImage(dataUrl: string, filename: string) {
  const blob = await (await fetch(dataUrl)).blob()
  const file = new File([blob], filename, { type: blob.type })
  if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ files: [file], title: filename })
      return
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
