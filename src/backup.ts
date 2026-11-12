import { get, set } from 'idb-keyval'
import { cleanTag, migrateArt, migrateNail, type Art, type Nail } from './store'

// 구글 드라이브에 올리는 백업 내용: 이달의 아트 + 팔레트(네일·해시태그)  ※ 백업 화면은 준비 중, 클라우드 연결 때 사용
export interface BackupData {
  arts: Art[]
  nails: Nail[]
  tags: string[]
}
interface BackupFile extends BackupData {
  app: 'nail-app'
  version: 4
  exportedAt: number
}

export function makeBackup(d: BackupData): string {
  const data: BackupFile = { app: 'nail-app', version: 4, exportedAt: Date.now(), ...d }
  return JSON.stringify(data)
}

export function parseBackup(text: string): BackupData {
  let b: Partial<BackupFile> & { version?: number; categories?: string[] }
  try { b = JSON.parse(text) } catch { throw new Error('드라이브의 백업 파일을 읽을 수 없어요.') }
  if (b?.app !== 'nail-app' || !Array.isArray(b.arts)) throw new Error('이 앱의 백업 파일이 아니에요.')
  if ((b.version ?? 0) > 4) throw new Error('이 앱보다 새 버전에서 만든 백업이에요. 앱을 업데이트해 주세요.')
  // 예전 버전 백업도 변환해서 받아들임
  return {
    arts: b.arts.map(migrateArt),
    nails: (Array.isArray(b.nails) ? b.nails : []).filter((n) => n?.id && n.src).map(migrateNail),
    tags: (Array.isArray(b.tags) ? b.tags : Array.isArray(b.categories) ? b.categories : [])
      .filter((c) => typeof c === 'string').map(cleanTag),
  }
}

/**
 * 기존 데이터를 지우지 않고 합치기.
 * - 네일: 없는 것만 추가
 * - 아트: 한 달에 하나 → 같은 달이면 더 최근에 수정된 쪽을 남김
 * - 해시태그: 합집합, 같은 네일은 기존 것 유지
 */
export function mergeBackup(cur: BackupData, inc: BackupData) {
  const nailIds = new Set(cur.nails.map((n) => n.id))
  const newNails = inc.nails.filter((n) => !nailIds.has(n.id))

  const byMonth = new Map(cur.arts.map((a) => [a.month, a]))
  let addedArts = 0, updatedArts = 0
  for (const a of inc.arts) {
    if (!a?.id || !a.image) continue
    const mine = byMonth.get(a.month)
    if (!mine) { byMonth.set(a.month, a); addedArts++ }
    else if (a.updatedAt > mine.updatedAt) { byMonth.set(a.month, a); updatedArts++ }
  }

  const tags = [...cur.tags, ...inc.tags.filter((t) => !cur.tags.includes(t))]
  return {
    nails: [...newNails, ...cur.nails],
    arts: [...byMonth.values()],
    tags,
    addedNails: newNails.length,
    addedArts,
    updatedArts,
  }
}

export const loadLastBackup = async () => (await get<number>('lastBackup')) ?? null
export const saveLastBackup = (t: number) => set('lastBackup', t)
