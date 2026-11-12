import { useEffect, useState } from 'react'
import { connectDrive, disconnectDrive, driveConfigured, isDriveConnected, preloadDrive } from './drive'

interface Props {
  artCount: number
  nailCount: number
  lastBackup: number | null
  onBackup: () => Promise<void>
  onRestore: () => Promise<void>
}

/** 백업 탭: 이달의 아트 + 팔레트를 구글 드라이브에 */
export default function Backup({ artCount, nailCount, lastBackup, onBackup, onRestore }: Props) {
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(isDriveConnected)
  const [now] = useState(() => Date.now())
  const configured = driveConfigured()
  const daysSince = lastBackup ? Math.floor((now - lastBackup) / 86400000) : null
  const stale = artCount + nailCount > 0 && (daysSince === null || daysSince >= 14)

  useEffect(() => { preloadDrive().catch(() => {}) }, [])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { alert((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <section className="panel">
      <h2 className="section-title">백업</h2>
      <div className="backup-stats">
        <div><b>{artCount}</b><span>이달의 아트</span></div>
        <div><b>{nailCount}</b><span>팔레트 네일</span></div>
      </div>
      <p className="hint">
        이달의 아트와 팔레트는 이 기기에만 저장돼요. 내 구글 드라이브를 연결해 두면 폰을 바꾸거나 데이터가 지워져도 다시 불러올 수 있어요.
      </p>

      <div className="backup-card">
        {!configured ? (
          <p className="hint warn">구글 드라이브 연결 설정이 아직 안 됐어요. (개발자 설정: README의 “구글 드라이브 백업 설정” 참고)</p>
        ) : !connected ? (
          <>
            <p className="hint">처음 한 번 구글 계정을 고르고 허용하면 돼요. 이 앱 전용 숨김 폴더만 쓰고, 다른 드라이브 파일은 보지 않아요.</p>
            <div className="actions">
              <button className="btn primary" disabled={busy}
                onClick={() => run(async () => { await connectDrive(); setConnected(true) })}>
                구글 드라이브 연결
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="hint ok">구글 드라이브가 연결돼 있어요.</p>
            <p className={`hint ${stale ? 'warn' : ''}`}>
              {lastBackup
                ? `마지막 백업: ${new Date(lastBackup).toLocaleDateString('ko-KR')}${daysSince ? ` (${daysSince}일 전)` : ' (오늘)'}`
                : '아직 백업한 적이 없어요.'}
            </p>
            <div className="actions">
              <button className="btn small" disabled={busy}
                onClick={() => { if (confirm('이 기기에서 구글 드라이브 연결을 끊을까요? 드라이브에 있는 백업은 그대로 남아요.')) { disconnectDrive(); setConnected(false) } }}>
                연결 끊기
              </button>
              <button className="btn" disabled={busy} onClick={() => run(onRestore)}>드라이브에서 불러오기</button>
              <button className="btn primary" disabled={busy} onClick={() => run(onBackup)}>
                {busy ? '진행 중…' : '드라이브에 백업'}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
