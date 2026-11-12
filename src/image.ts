/** 사진 파일 → 긴 변 maxDim 이하 JPEG dataURL (용량 절약) */
export async function fileToDataUrl(file: File, maxDim = 1000): Promise<{ src: string; w: number; h: number }> {
  const bmp = await createImageBitmap(file)
  const s = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * s)
  c.height = Math.round(bmp.height * s)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return { src: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height }
}

/** dataURL 이미지의 원본 크기 */
export function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((res, rej) => {
    const i = new Image()
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight })
    i.onerror = rej
    i.src = src
  })
}
