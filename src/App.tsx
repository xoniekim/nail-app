import { useEffect, useRef, useState } from 'react'
import Palette from './palette/Palette'
import ArtsTab from './arts/ArtsTab'
import BackupTab from './BackupTab'
import {
  loadArts, loadDraft, loadNails, loadTags, saveArts, saveDraft, saveNails, saveTags,
  type Art, type Draft, type Nail,
} from './store'

type Tab = 'palette' | 'arts' | 'backup'

export default function App() {
  const [tab, setTab] = useState<Tab>('palette')
  const [nails, setNails] = useState<Nail[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [arts, setArts] = useState<Art[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(0)

  useEffect(() => {
    Promise.all([loadNails(), loadTags(), loadArts(), loadDraft()]).then(([n, t, a, d]) => {
      setNails(n); setTags(t); setArts(a); setDraft(d)
      if (n.length > 0) setTab('arts')
    })
    // 브라우저가 저장공간 부족 등으로 데이터를 임의로 지우지 않도록 요청 (지원 브라우저만)
    navigator.storage?.persist?.().catch(() => {})
  }, [])

  const notify = (msg: string, ms = 2200) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), ms)
  }

  const updateNails = (n: Nail[]) => { setNails(n); saveNails(n) }
  const updateTags = (t: string[]) => { setTags(t); saveTags(t) }
  const updateArts = (a: Art[]) => { setArts(a); saveArts(a) }
  const updateDraft = (d: Draft) => { setDraft(d); saveDraft(d) }

  if (!draft) return <div className="loading">불러오는 중…</div>

  return (
    <div className="app">
      <header className="top">
        <h1>💅 네일 조합</h1>
      </header>

      <main>
        {tab === 'palette' && (
          <Palette nails={nails} tags={tags} onNails={updateNails} onTags={updateTags} notify={notify} />
        )}
        {tab === 'arts' && (
          <ArtsTab
            arts={arts}
            onArts={updateArts}
            draft={draft}
            onDraft={updateDraft}
            nails={nails}
            tags={tags}
            onNails={updateNails}
            notify={notify}
          />
        )}
        {tab === 'backup' && <BackupTab />}
      </main>

      <nav className="tabs">
        <button className={tab === 'palette' ? 'on' : ''} onClick={() => setTab('palette')}><span>🎨</span>팔레트</button>
        <button className={tab === 'arts' ? 'on' : ''} onClick={() => setTab('arts')}><span>🗓️</span>이달의 아트</button>
        <button className={tab === 'backup' ? 'on' : ''} onClick={() => setTab('backup')}><span>☁️</span>백업</button>
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
