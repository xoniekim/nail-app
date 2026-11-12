import { useEffect, useRef, useState } from 'react'
import Palette from './palette/Palette'
import ArtsTab from './arts/ArtsTab'
import Backup from './BackupTab'
import { loadLastBackup, makeBackup, mergeBackup, parseBackup, saveLastBackup } from './backup'
import { downloadBackup, uploadBackup } from './drive'
import {
  loadArts, loadCategories, loadDraft, loadNails, saveArts, saveCategories, saveDraft, saveNails,
  type Art, type Draft, type Nail,
} from './store'

type Tab = 'palette' | 'arts' | 'backup'

export default function App() {
  const [tab, setTab] = useState<Tab>('palette')
  const [nails, setNails] = useState<Nail[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [arts, setArts] = useState<Art[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [toast, setToast] = useState('')
  const [lastBackup, setLastBackup] = useState<number | null>(null)
  const toastTimer = useRef(0)

  useEffect(() => {
    Promise.all([loadNails(), loadCategories(), loadArts(), loadDraft(), loadLastBackup()]).then(([n, c, a, d, b]) => {
      setNails(n); setCategories(c); setArts(a); setDraft(d); setLastBackup(b)
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
  const updateCategories = (c: string[]) => { setCategories(c); saveCategories(c) }
  const updateArts = (a: Art[]) => { setArts(a); saveArts(a) }
  const updateDraft = (d: Draft) => { setDraft(d); saveDraft(d) }

  // 버튼 클릭에서 바로 호출됨 (구글 로그인 팝업이 막히지 않도록 await 전에 요청이 나감)
  const backup = async () => {
    await uploadBackup(makeBackup({ arts, nails, categories }))
    const now = Date.now()
    setLastBackup(now)
    saveLastBackup(now)
    notify('구글 드라이브에 백업했어요')
  }

  const restore = async () => {
    const file = await downloadBackup()
    if (!file) { alert('구글 드라이브에 아직 백업이 없어요.'); return }
    const m = mergeBackup({ arts, nails, categories }, parseBackup(file.text))
    updateArts(m.arts)
    updateNails(m.nails)
    updateCategories(m.categories)
    const parts = [
      m.addedNails && `네일 ${m.addedNails}개`,
      m.addedArts && `아트 ${m.addedArts}개`,
      m.updatedArts && `수정된 아트 ${m.updatedArts}개`,
    ].filter(Boolean)
    notify(parts.length ? `${parts.join(', ')}를 불러왔어요` : '이미 모두 들어 있어서 새로 불러온 게 없어요', 3000)
  }

  if (!draft) return <div className="loading">불러오는 중…</div>

  return (
    <div className="app">
      <header className="top">
        <h1>💅 네일 조합</h1>
      </header>

      <main>
        {tab === 'palette' && (
          <Palette nails={nails} categories={categories} onNails={updateNails} onCategories={updateCategories} notify={notify} />
        )}
        {tab === 'arts' && (
          <ArtsTab
            arts={arts}
            onArts={updateArts}
            draft={draft}
            onDraft={updateDraft}
            nails={nails}
            categories={categories}
            onNails={updateNails}
            notify={notify}
          />
        )}
        {tab === 'backup' && (
          <Backup artCount={arts.length} nailCount={nails.length} lastBackup={lastBackup} onBackup={backup} onRestore={restore} />
        )}
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
