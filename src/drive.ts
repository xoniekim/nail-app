// 구글 드라이브 백업 (앱 전용 숨김 폴더 appDataFolder 사용)
// - 사용자의 드라이브 파일은 볼 수 없고, 이 앱이 만든 파일만 읽고 쓸 수 있는 권한(drive.appdata)만 요청한다.
// - 서버 없이 브라우저에서 바로 구글 API를 호출하므로 비용이 들지 않는다.
// 설정: .env.local 에 VITE_GOOGLE_CLIENT_ID=... (README 참고)

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const FILE_NAME = 'nail-backup.json'

interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken: (o?: { prompt?: string }) => void; callback: (r: TokenResponse) => void }
declare global {
  interface Window {
    google?: { accounts: { oauth2: {
      initTokenClient: (c: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string }) => void }) => TokenClient
      revoke: (token: string, done?: () => void) => void
    } } }
  }
}

export const driveConfigured = () => Boolean(CLIENT_ID)

// 한 번 연결(허용)한 적이 있는지 기억 → 버튼을 "연결"에서 "백업/불러오기"로 바꿔 보여주기 위함
const CONNECTED_KEY = 'driveConnected'
export function isDriveConnected(): boolean {
  try { return localStorage.getItem(CONNECTED_KEY) === '1' } catch { return false }
}
function markConnected(on: boolean) {
  try { if (on) localStorage.setItem(CONNECTED_KEY, '1'); else localStorage.removeItem(CONNECTED_KEY) } catch { /* 무시 */ }
}

/** "구글 드라이브 연결" 버튼: 구글 계정 선택·허용 창을 띄운다 (버튼 클릭에서 바로 호출) */
export async function connectDrive(): Promise<void> {
  await getToken()
}

/** 연결 해제: 이 기기에서 허용을 취소 */
export function disconnectDrive() {
  if (token && window.google) window.google.accounts.oauth2.revoke(token.value)
  token = null
  markConnected(false)
}

let client: TokenClient | null = null
let token: { value: string; expires: number } | null = null
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null
let scriptPromise: Promise<void> | null = null

/** 구글 로그인 스크립트를 미리 불러둔다 (버튼을 누른 순간 팝업이 막히지 않도록) */
export function preloadDrive(): Promise<void> {
  if (!CLIENT_ID) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((res, rej) => {
      const s = document.createElement('script')
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      s.onload = () => {
        client = window.google!.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPE,
          callback: (r) => {
            if (r.access_token) {
              token = { value: r.access_token, expires: Date.now() + ((r.expires_in ?? 3600) - 60) * 1000 }
              markConnected(true)
              pending?.resolve(r.access_token)
            } else {
              pending?.reject(new Error(r.error_description || '구글 로그인에 실패했어요.'))
            }
            pending = null
          },
          error_callback: (e) => {
            pending?.reject(new Error(e.type === 'popup_closed' ? '로그인 창이 닫혔어요.' : '구글 로그인 창을 열 수 없어요. 팝업 차단을 확인해 주세요.'))
            pending = null
          },
        })
        res()
      }
      s.onerror = () => { scriptPromise = null; rej(new Error('구글 로그인을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.')) }
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

/** 버튼 클릭 핸들러 안에서 바로 호출해야 함 (팝업 허용 조건) */
function getToken(): Promise<string> {
  if (token && token.expires > Date.now()) return Promise.resolve(token.value)
  if (!client) return Promise.reject(new Error('구글 로그인을 준비 중이에요. 잠시 후 다시 눌러 주세요.'))
  return new Promise((resolve, reject) => {
    pending = { resolve, reject }
    // 이미 연결한 적 있으면 계정 선택 없이 조용히 토큰만 다시 받기
    client!.requestAccessToken({ prompt: isDriveConnected() ? '' : 'consent' })
  })
}

async function api(path: string, t: string, init: RequestInit = {}) {
  const r = await fetch(path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` } })
  if (r.status === 401) { token = null; throw new Error('구글 로그인이 만료됐어요. 다시 눌러 주세요.') }
  if (!r.ok) throw new Error(`구글 드라이브 요청이 실패했어요 (${r.status}).`)
  return r
}

async function findFile(t: string): Promise<{ id: string; modifiedTime: string } | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}'`)
  const r = await api(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`, t)
  const j = (await r.json()) as { files: { id: string; modifiedTime: string }[] }
  return j.files[0] ?? null
}

/** 드라이브에 백업 올리기 (있으면 덮어쓰기) */
export async function uploadBackup(json: string): Promise<void> {
  const t = await getToken()
  const existing = await findFile(t)
  if (existing) {
    await api(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`, t, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: json,
    })
    return
  }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] })], { type: 'application/json' }))
  form.append('file', new Blob([json], { type: 'application/json' }))
  await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', t, { method: 'POST', body: form })
}

/** 드라이브에서 백업 내려받기. 없으면 null */
export async function downloadBackup(): Promise<{ text: string; modifiedTime: string } | null> {
  const t = await getToken()
  const f = await findFile(t)
  if (!f) return null
  const r = await api(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, t)
  return { text: await r.text(), modifiedTime: f.modifiedTime }
}
