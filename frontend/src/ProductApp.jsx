import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './product.css'
import './interaction.css'
import './nature.css'
import './notebook.css'
import { NatureIcon, NatureCalendar, MoodFace, normalizeEmotion } from './NatureUI.jsx'
import QuietScene from './QuietScene.jsx'
import RelaxationChoice from './RelaxationChoice.jsx'
import MoodTimeline from './MoodTimeline.jsx'

const API = '/api'
const CHAT_TEXT_LIMIT = 4000
const ACTIVITY_PROMPT = '我想找个适合现在的小活动，你能陪我一起想想吗？我们可以先聊聊想做什么，再慢慢考虑时间和预算。'
const EMOTIONS = ['开心', '平静', '疲惫', '低落', '焦虑', '生气', '混合/说不清', '其他']
const PETS = [
  { id: 'otter', name: '沐沐', kind: '小水獭', intro: '我喜欢安静地听你说话。你想办法的时候，我也可以陪你一起想。', manner: '温柔、留白多，擅长先听完再回应。' },
  { id: 'bear', name: '团团', kind: '小熊', intro: '遇到一团乱麻时，我可以陪你慢慢理，不替你做决定。', manner: '像稳重的老朋友，表达踏实直接。' },
  { id: 'rabbit', name: '绵绵', kind: '小兔子', intro: '我会安静地陪你待着。你想说话时，我会认真听。', manner: '柔软、细腻，适合倾听和安慰。' },
  { id: 'cat', name: '绒绒', kind: '小猫', intro: '我喜欢安静地靠近你。你想说话时，我会认真听着。', manner: '细腻、安静，擅长陪你慢慢整理感受。' },
  { id: 'dog', name: '豆豆', kind: '小狗', intro: '我会为你留一盏小小的热闹，也陪你迈出下一步。', manner: '热情、可靠，适合一起行动和庆祝。' },
]
const DEFAULT_SETTINGS = { memory_enabled: false, save_enabled: true, nickname: '', response_preference: 'adapt', pet_id: 'otter', onboarding_complete: false }

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Request failed (${response.status})`)
  }
  return response.json()
}

const json = (method, body) => ({ method, body: JSON.stringify(body) })
const dateLabel = value => new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })

function ProductApp() {
  const [page, setPage] = useState('陪伴')
  const [quiet, setQuiet] = useState(false)
  const [diaryView, setDiaryView] = useState('calendar')
  const [diaryTarget, setDiaryTarget] = useState(null)
  const [calendarState, setCalendarState] = useState(null)
  const [diaryOpenVersion, setDiaryOpenVersion] = useState(0)
  const openDiary = (id, standalone = false) => { setDiaryOpenVersion(value => value + 1); setDiaryTarget(typeof id === 'string' ? id : null); setDiaryView(standalone ? 'read' : 'list'); setPage('日记') }
  const startDiary = () => { setDiaryOpenVersion(value => value + 1); setDiaryTarget(null); setDiaryView('write'); setPage('日记') }
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [diaries, setDiaries] = useState([])
  const [profiles, setProfiles] = useState([])
  const [metrics, setMetrics] = useState({ counts: {}, timeline: [], total_confirmed: 0 })
  const [booted, setBooted] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [petMood, setPetMood] = useState('idle')
  const [petPosition, setPetPosition] = useState(() => {
    try { return JSON.parse(localStorage.getItem('heart-pet-position')) } catch { return null }
  })
  const [showPetPicker, setShowPetPicker] = useState(false)

  useEffect(() => {
    document.querySelector('.notebook-page-content')?.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    if (window.matchMedia('(max-width: 650px)').matches) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [page, diaryView, diaryOpenVersion])

  const refresh = useCallback(async () => {
    // Establish the public visitor cookie before issuing parallel data requests.
    const settingsResult = await request('/settings')
    const [diaryResult, profileResult, metricsResult] = await Promise.all([
      request('/diaries'), request('/profile'), request('/metrics/emotions?days=7'),
    ])
    setDiaries(diaryResult.items)
    setProfiles(profileResult.items)
    const normalizedSettings = { ...DEFAULT_SETTINGS, ...settingsResult }
    // 兼容旧版本已保存的云朵角色，避免角色找不到时回退到沐沐。
    if (normalizedSettings.pet_id === 'cloud') normalizedSettings.pet_id = 'rabbit'
    setSettings(normalizedSettings)
    setMetrics(metricsResult)
  }, [])

  useEffect(() => {
    refresh().catch(() => setError('现在暂时连不上心栖服务。你写下的内容会留在输入框里。')).finally(() => setBooted(true))
  }, [refresh])

  const updateSettings = async changes => {
    const next = await request('/settings', json('PATCH', changes))
    setSettings(current => ({ ...current, ...next }))
    setNotice('设置已更新')
  }

  const currentPet = PETS.find(item => item.id === settings.pet_id) || PETS[0]
  const latest = diaries[0]

  if (!booted) return <div className="loading-screen"><span className="loading-mark">心</span><span>正在等你回来…</span></div>

  return <div className={`product-shell notebook-shell ${quiet && page === '陪伴' ? 'quiet-active' : ''}`}>
    <div className="notebook-binding" aria-hidden="true">{[0, 1, 2, 3, 4].map(ring => <i key={ring} />)}</div>
    <header className="product-header">
      <button className="wordmark" onClick={() => setPage('陪伴')} aria-label="回到陪伴首页"><span className="wordmark-symbol"><NatureIcon name="leaf" /></span><span><strong>心栖</strong><small>情绪陪伴与日记</small></span></button>
      <nav className="primary-nav" aria-label="主导航">
        {['陪伴', '日记', '回顾', '我的'].map((item, index) => <button key={item} data-page-number={`0${index + 1}`} aria-label={item} aria-current={page === item ? 'page' : undefined} className={`nav-link ${page === item ? 'active' : ''} ${item === '陪伴' ? 'nav-companion' : ''}`} onClick={() => { setPage(item); if (item === '日记') setDiaryView('calendar') }}><NatureIcon name={item} />{item === '陪伴' && <span className="nav-pet"><PetAvatar pet={currentPet} mood={petMood} /></span>}<span>{item}</span></button>)}
      </nav>
      <div className="notebook-cover-note" aria-hidden="true"><NatureIcon name="leaf" /><p>把普通的一天，<br />也好好收在这里。</p><span>little things, kept close.</span></div>
      <span className="privacy-indicator"><i className={settings.memory_enabled ? 'status-led on' : 'status-led'} />{settings.memory_enabled ? '记忆调用已开启' : '记忆调用已关闭'}</span>
    </header>

    <main className={`product-main ${page === '陪伴' ? 'companion-page' : ''}`}>
      <div className="nature-topline"><strong>心栖 · HeartNest</strong><span>心情有处可栖</span></div>
      <div className="notebook-page-content">
      {settings.public_demo && <details className="public-demo-notice"><summary>公网演示 · 当前浏览器独立数据</summary><p>使用本地规则回应，未接入大模型。请使用虚构内容；浏览器通过 Cookie 识别，闲置 24 小时后失效，过期数据在后续请求时清理。清除 Cookie 后无法找回记录。临时链接需要演示电脑保持在线。</p></details>}
      {error && <div className="inline-alert error-alert" role="alert">{error}<button onClick={() => { setError(''); refresh().catch(() => setError('服务仍不可用，请稍后重试。')) }}>重试</button></div>}
      {notice && <div className="inline-alert success-alert" role="status">{notice}<button aria-label="关闭提示" onClick={() => setNotice('')}>收起</button></div>}
      <CompanionPage active={page === '陪伴'} quiet={quiet} setQuiet={setQuiet} petMood={petMood} pet={currentPet} nickname={settings.nickname} responsePreference={settings.response_preference} diaries={diaries} memoryEnabled={settings.memory_enabled} saveEnabled={settings.save_enabled} setPetMood={setPetMood} setNotice={setNotice} onDiarySaved={refresh} onOpenDiaries={openDiary} />
      {page === '日记' && <div className="diary-workspace"><header className="page-heading nature-diary-heading"><div><p className="eyebrow">{diaryView === 'write' ? '留一页给现在的自己' : '把心情放回时间里'}</p><h1>{diaryView === 'write' ? '写一篇日记' : diaryView === 'read' ? '这一页的心情' : '我的心情日记'}</h1><p>{diaryView === 'write' ? '慢慢写，只留下你想留下的。' : diaryView === 'read' ? '把那一天，轻轻翻开。' : '平稳的日子，也值得记下来。'}</p></div>{diaryView === 'write' ? <button className="secondary-button" onClick={() => setDiaryView('list')}>返回日记列表</button> : <button className="primary-button" onClick={startDiary}>＋ 写日记</button>}</header>{diaryView === 'read' && <div className="diary-reading-back"><button className="text-link" onClick={() => setDiaryView('calendar')}>← 返回心情日历</button></div>}{!['write', 'read'].includes(diaryView) && <div className="diary-tabs" role="tablist" aria-label="日记视图"><button role="tab" aria-selected={diaryView === 'calendar'} onClick={() => setDiaryView('calendar')}>心情日历</button><button role="tab" aria-selected={diaryView === 'list'} onClick={() => setDiaryView('list')}>日记列表</button></div>}{diaryView === 'calendar' ? <NatureCalendar request={request} state={calendarState} onStateChange={setCalendarState} onOpenDiary={id => openDiary(id, true)} onWrite={startDiary} /> : <DiaryPage view={diaryView} onCreated={openDiary} openVersion={diaryOpenVersion} initialId={diaryTarget} diaries={diaries} saveEnabled={settings.save_enabled} responsePreference={settings.response_preference} onRefresh={refresh} />}</div>}

      {page === '回顾' && <ReviewPage metrics={metrics} diaries={diaries} onOpenDiary={openDiary} />}
      {page === '我的' && <SettingsPage settings={settings} profiles={profiles} pet={currentPet} onUpdate={updateSettings} onChoosePet={() => setShowPetPicker(true)} onRefresh={refresh} />}
      </div>
      <div className="notebook-page-footer" aria-hidden="true"><span>HEARTNEST · 心情手账</span><span>0{['陪伴', '日记', '回顾', '我的'].indexOf(page) + 1} / 04</span></div>
    </main>

    <PetDock pet={currentPet} mood={petMood} page={page} position={petPosition} onMove={setPetPosition} onOpen={() => setPage('陪伴')} onChange={() => setShowPetPicker(true)} />
    {!settings.onboarding_complete && <Onboarding onComplete={async values => {
      await updateSettings({ ...values, onboarding_complete: true })
      setPage('陪伴')
    }} />}
    {showPetPicker && <PetPicker currentPet={currentPet} onChoose={async id => { await updateSettings({ pet_id: id }); setShowPetPicker(false) }} onClose={() => setShowPetPicker(false)} />}
  </div>
}

function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0)
  const [petId, setPetId] = useState('otter')
  const [nickname, setNickname] = useState('')
  const [preference, setPreference] = useState('adapt')
  const [memoryEnabled, setMemoryEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const selectedPet = PETS.find(item => item.id === petId)
  const finish = async () => {
    setBusy(true)
    try { await onComplete({ pet_id: petId, nickname: nickname.trim(), response_preference: preference, memory_enabled: memoryEnabled }) }
    finally { setBusy(false) }
  }
  return <div className="onboarding-backdrop">
    <section className="onboarding-panel" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-topline"><span>第一次见面</span><span>{step + 1} / 3</span></div>
      {step === 0 && <>
        <p className="eyebrow">让我先介绍我的朋友</p><h1 id="onboarding-title">谁来陪你一会儿？</h1><p className="onboarding-copy">听听他们怎么介绍自己，再选一个想留在页面里的伙伴。</p>
        <div className="pet-selection-grid">{PETS.map(pet => <button key={pet.id} className={pet.id === petId ? 'pet-selection selected' : 'pet-selection'} onClick={() => setPetId(pet.id)}>
          <PetAvatar pet={pet} mood="idle" large /><span className="pet-name">{pet.name}<small>{pet.kind}</small></span><span className="pet-manner">{pet.manner}</span><span className="pet-intro">“{pet.intro}”</span><span className="choose-pet">{pet.id === petId ? `让 ${pet.name} 陪我` : `选择 ${pet.name}`}</span>
        </button>)}</div>
        <button className="primary-button onboarding-next" onClick={() => setStep(1)}>认识 {selectedPet.name}<span aria-hidden="true">→</span></button>
      </>}
      {step === 1 && <>
        <p className="eyebrow">{selectedPet.name}想认识你</p><h1 id="onboarding-title">我该怎么称呼你？</h1><p className="onboarding-copy">不用填真实姓名，不想设置也可以留空。</p>
        <label className="form-label" htmlFor="nickname">我该怎么称呼你？</label><input id="nickname" className="text-input nickname-input" value={nickname} maxLength={40} onChange={event => setNickname(event.target.value)} placeholder="可以是昵称" />
        <div className="onboarding-actions"><button className="quiet-button" onClick={() => setStep(0)}>上一步</button><button className="primary-button" onClick={() => setStep(2)}>继续</button></div>
      </>}
      {step === 2 && <>
        <p className="eyebrow">按你的习惯来</p><h1 id="onboarding-title">如果你心情不太好……</h1><p className="onboarding-copy">你通常更希望我先听你说，还是陪你一起想办法？之后也可以按当下需要改变。</p>
        <div className="preference-options">
          {[['listen_first', '先听我说'], ['think_together', '一起想办法'], ['adapt', '看当时情况']].map(([value, label]) => <button key={value} className={preference === value ? 'preference-option selected' : 'preference-option'} aria-pressed={preference === value} onClick={() => setPreference(value)}>{label}</button>)}
        </div>
        <label className="consent-row"><input type="checkbox" checked={memoryEnabled} onChange={event => setMemoryEnabled(event.target.checked)} /><span><strong>允许心栖在聊天时查找旧日记</strong><small>关闭后，你仍可自己查看日记。默认不调用。</small></span></label>
        <div className="onboarding-actions"><button className="quiet-button" onClick={() => setStep(1)}>上一步</button><button className="primary-button" disabled={busy} onClick={finish}>{busy ? '正在保存…' : '完成设置'}</button></div>
      </>}
    </section>
  </div>
}

function CompanionPage({ active, quiet, setQuiet, petMood, pet, nickname, responsePreference, diaries, memoryEnabled, saveEnabled, setPetMood, setNotice, onDiarySaved, onOpenDiaries }) {
  const [chat, setChat] = useState([])
  const openDiaryFromChat = onOpenDiaries
  const [toolsOpen, setToolsOpen] = useState(false)
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1101px)')
    const closeOnWide = () => { if (wide.matches) setToolsOpen(false) }
    wide.addEventListener('change', closeOnWide)
    return () => wide.removeEventListener('change', closeOnWide)
  }, [])
  const [quietChatOpen, setQuietChatOpen] = useState(false)
  const quietEntry = useRef(null)
  const [relaxationOpen, setRelaxationOpen] = useState(false)
  useEffect(() => {
    if (!active) { setToolsOpen(false); setRelaxationOpen(false); setQuiet(false); setQuietChatOpen(false) }
  }, [active, setQuiet])
  const relaxationInvited = useRef(false)
  const focusComposer = () => requestAnimationFrame(() => composerInput.current?.focus({ preventScroll: true }))
  const dismissInvitation = id => setChat(items => items.map(item => item.id === id ? { ...item, relaxationInvitation: false } : item))
  const closeQuiet = () => { setQuiet(false); setQuietChatOpen(false); requestAnimationFrame(() => quietEntry.current?.focus({ preventScroll: true })) }
  const openQuietChat = value => { setQuietChatOpen(value); if (value) requestAnimationFrame(() => composerInput.current?.focus({ preventScroll: true })) }
  const [draft, setDraft] = useState('')
  const [saveToMemory, setSaveToMemory] = useState(false)
  const [saveReply, setSaveReply] = useState(false)
  const memoryRecords = useRef(new Map())
  const savingRecords = useRef(new Set())
  const confirmedLabels = useRef(new Map())
  const [savingTurns, setSavingTurns] = useState([])
  const [sending, setSending] = useState(false)
  const sendingLock = useRef(false)
  const completedRequests = useRef(new Set())
  const declinedAdvice = useRef(new Set())
  const [savedIds, setSavedIds] = useState([])
  const [editEmotionFor, setEditEmotionFor] = useState(null)
  const [saveError, setSaveError] = useState('')
  const messagesEnd = useRef(null)
  const composerInput = useRef(null)
  const lastUserTurn = useMemo(() => [...chat].reverse().find(message => message.role === 'user'), [chat])
  const lastAssistantTurn = useMemo(() => [...chat].reverse().find(message => message.role === 'assistant'), [chat])
  const greetings = nickname ? `${nickname}，今天有什么想和我说的吗？不想聊也没关系。` : '今天有什么想和我说的吗？不想聊也没关系。'

  useEffect(() => {
    const scroll = messagesEnd.current?.parentElement
    scroll?.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' })
  }, [chat, active])

  const send = async (text = draft, wantAdvice = false, retryJob = null, displayText = null, excludeAdviceIds = []) => {
    const content = (retryJob?.text ?? text).trim()
    if (!content || sendingLock.current || (retryJob && completedRequests.current.has(retryJob.id))) return
    if ([...content].length > CHAT_TEXT_LIMIT) { setSaveError('每条消息最多 4000 字，可以分成几段慢慢说。'); return }
    const job = retryJob || {
      id: crypto.randomUUID(), text: content, wantAdvice,
      userId: crypto.randomUUID(), userText: displayText || (wantAdvice && content !== '我现在想放松一下，请给我一个简单的练习。' ? '请根据我们刚才聊的内容，给我一个小建议。' : content), excludeAdviceIds: [...new Set([...excludeAdviceIds, ...declinedAdvice.current])],
      saveOriginal: !wantAdvice && saveToMemory && saveEnabled, saveResponse: saveReply,
      preference: responsePreference,
      conversation: chat.filter(message => message.role === 'user' || message.role === 'assistant').slice(-6).map(message => ({ role: message.role, content: message.text })),
    }
    sendingLock.current = true
    setSaveError('')
    if (!retryJob) {
      setChat(items => [...items, { id: job.userId, role: 'user', text: job.userText, emotionLabel: null }])
      if (content === draft.trim()) setDraft('')
    }
    setSending(true)
    setPetMood('thinking')
    try {
      const response = await request('/companion/respond', json('POST', { text: content, want_advice: job.wantAdvice, response_preference: job.preference, conversation: job.conversation, exclude_advice_ids: job.excludeAdviceIds || [] }))
      // Only explicit requests invite a choice; an emotion label alone is insufficient.
      const explicitRest = /(?:我想|想要|想|需要|帮我|陪我)(?:好好)?(?:放松|休息|缓一缓|歇一会)/.test(content)
      const declinesAdvice = /(?:不|别|不用|不要|无需|只想|只要|仅想|仅需)/.test(content)
      const recallsRest = /(?:以前|之前|上次|曾经|说过|提过|记得)/.test(content)
      const invite = !job.wantAdvice && !quiet && !relaxationInvited.current && explicitRest && !declinesAdvice && !recallsRest && !response.safety && response.intent !== 'recall' && !response.suggestion
      if (invite) relaxationInvited.current = true
      completedRequests.current.add(job.id)
      setChat(items => [...items.filter(item => item.id !== `failed-${job.id}`), { id: crypto.randomUUID(), userId: job.userId, role: 'assistant', text: response.reply, excludedAdviceIds: [...(job.excludeAdviceIds || []), ...(response.suggestion ? [response.suggestion.id] : [])], profileProposals: response.profile_proposals || [], suggestion: response.suggestion, memories: response.memories || [], emotionSuggestion: response.emotion_suggestion, safety: response.safety, memoryEnabled: response.memory_enabled, relaxationInvitation: invite, adviceContext: job.wantAdvice ? content : null, replySource: response.reply_source || (response.safety ? 'safety' : response.intent === 'recall' ? 'memory' : response.suggestion ? 'advice' : typeof response.llm_used === 'boolean' ? response.llm_used ? 'llm' : 'rules' : null), fallbackReason: response.reply_fallback_reason, understandingSource: response.understanding_source }])
      if (job.saveOriginal) await persistTurn({ id: job.userId, text: content }, job.saveResponse ? response.reply : null)
      return response
    } catch {
      setChat(items => [...items.filter(item => item.id !== `failed-${job.id}`), { id: `failed-${job.id}`, role: 'failed', job }])
    } finally {
      sendingLock.current = false
      setSending(false)
      setPetMood('idle')
    }
  }

  const setTurnEmotion = async (turnId, label) => {
    confirmedLabels.current.set(turnId, label)
    setChat(items => items.map(item => item.id === turnId ? { ...item, emotionLabel: label } : item))
    const recordId = memoryRecords.current.get(turnId)
    if (recordId) {
      try {
        await request(`/diaries/${recordId}/emotion`, json('PATCH', { label, status: 'confirmed' }))
        await onDiarySaved()
      } catch { setSaveError('聊天中的标记已更新，但记忆库中的情绪尚未更新，请重试。') }
    }
  }
  const persistTurn = async (userTurn, responseText = null) => {
    if (!saveEnabled) { setSaveError('新记录保存已关闭。可以到“我的”中开启，或继续不保存地聊天。'); return }
    if (!userTurn || memoryRecords.current.has(userTurn.id) || savingRecords.current.has(userTurn.id)) return
    savingRecords.current.add(userTurn.id)
    setSavingTurns(ids => [...ids, userTurn.id])
    setSaveError('')
    try {
      const label = confirmedLabels.current.get(userTurn.id) || userTurn.emotionLabel
      const saved = await request('/diaries', json('POST', { kind: 'chat', text: userTurn.text, mode: 'respond', response_requested: true, response_text: responseText, allow_retrieval: true, emotion_label: label || undefined }))
      memoryRecords.current.set(userTurn.id, saved.id)
      setSavedIds(ids => [...ids, userTurn.id])
      const latestLabel = confirmedLabels.current.get(userTurn.id)
      if (latestLabel && latestLabel !== label) await request(`/diaries/${saved.id}/emotion`, json('PATCH', { label: latestLabel, status: 'confirmed' }))
      setNotice(`${responseText ? '原话和心栖回应' : '你的原话'}已加入 Agent 记忆库，也可以在日记中查看或删除。`)
      await onDiarySaved()
    } catch {
      setSaveError('回复和原话仍在当前聊天中，但加入记忆库失败。可以点击“加入 Agent 记忆库”重试。')
    } finally {
      savingRecords.current.delete(userTurn.id)
      setSavingTurns(ids => ids.filter(id => id !== userTurn.id))
    }
  }
  const saveTurn = turn => { return persistTurn(chat.find(item => item.id === turn.userId), saveReply ? turn.text : null) }

  return <div hidden={!active} className={`companion-view ${quiet ? 'quiet-mode' : ''} ${quietChatOpen ? 'quiet-chat-open' : ''}`}>
    {!quiet && <FloatingToolsButton expanded={toolsOpen} onOpen={() => setToolsOpen(true)} />}
    {toolsOpen && !quiet && <CompanionToolsDrawer onClose={() => setToolsOpen(false)}><section className="drawer-shortcuts"><p className="eyebrow">想从哪里开始？</p><button type="button" className="secondary-button" disabled={sending} onClick={() => { setToolsOpen(false); send(ACTIVITY_PROMPT) }}>一起找个小活动</button><button type="button" className="secondary-button" onClick={() => { setToolsOpen(false); setRelaxationOpen(true) }}>想放松一下</button><button type="button" className="secondary-button" onClick={() => { setToolsOpen(false); setQuietChatOpen(false); setQuiet(true) }}>陪我待会儿</button></section><CompanionTools diaries={diaries} memoryEnabled={memoryEnabled} onOpenDiaries={id => { setToolsOpen(false); openDiaryFromChat(id) }} /></CompanionToolsDrawer>}
    {relaxationOpen && <RelaxationChoice busy={sending} onDismiss={() => { setRelaxationOpen(false) }} onChat={() => { setRelaxationOpen(false); focusComposer() }} onLake={() => { setRelaxationOpen(false); setQuietChatOpen(false); setQuiet(true) }} onPractice={() => { setRelaxationOpen(false); focusComposer(); send('我现在想放松一下，请给我一个简单的练习。', true) }} />}
    {quiet && <QuietScene pet={pet} mood={petMood} renderPet={mood => <PetAvatar pet={pet} mood={mood} animated />} chatOpen={quietChatOpen} onChatChange={openQuietChat} onExit={closeQuiet} />}
    <div className="welcome-strip"><div><p className="eyebrow">和 {pet.name} 在一起</p><h1>{nickname ? `${nickname}，慢一点，` : '慢一点，'}<br/>也没关系。</h1><p>开心的、说不清的，都可以聊。</p></div><div className="hero-pet"><PetAvatar pet={pet} mood={petMood} large /></div><div className="welcome-actions"><div className="welcome-signal"><span className="signal-dot" />{chat.length ? '我在听' : '今天不必急着解决什么'}</div><button className="secondary-button" onClick={() => { composerInput.current?.focus() }}>聊聊</button><button className="secondary-button relaxation-entry" onClick={() => { setRelaxationOpen(true) }}>想放松一下</button><button ref={quietEntry} className="secondary-button quiet-entry" onClick={() => { setQuietChatOpen(false); setQuiet(true) }}>陪我待会儿</button></div></div>
    <div className="companion-grid">
      <section className="conversation-panel" aria-label="陪伴对话"><div className="nature-chat-heading"><span className="status-led on" /><strong>{pet.name}在听</strong><span>先陪你聊聊，不急着想办法</span>{quiet && <button className="quiet-chat-close" aria-label="关闭聊天面板" onClick={() => openQuietChat(false)}>收起</button>}</div>
        <div className="conversation-scroll" aria-live="polite">
          {!chat.length && <div className="conversation-empty"><p>{pet.intro}</p><span>从一件小事开始也可以。</span></div>}
          {chat.map((message, index) => message.role === 'notice' ? <div className="save-only-confirmation" role="status" key={message.id}>{message.text}</div> : message.role === 'failed' ? <section className="failed-request" role="alert" data-testid="failed-request" key={message.id}><p>回应暂时没有送达。你的原文还在，可以重试。</p>{message.job.wantAdvice && <p>这次请求：给我一个小办法</p>}<small>{message.job.wantAdvice ? '重试不会自动保存新的日记。' : message.job.saveOriginal ? `重试成功后，按这条消息原来的选择保存${message.job.saveResponse ? '原话和回应' : '原话'}。` : '这条消息原来选择了不保存，重试也不会写入日记。'}</small><button className="secondary-button" disabled={sending} onClick={() => send(message.job.text, message.job.wantAdvice, message.job)}>重试回应</button></section> : message.role === 'user' ? <article className="chat-turn user-turn" key={message.id}>
            <div className="message user-message">{message.text}</div>
            {message.emotionLabel && <span className="confirmed-mini-tag">你标记为 {message.emotionLabel}</span>}
            {savedIds.includes(message.id) && <span className="saved-mini-tag">已加入 Agent 记忆库</span>}
          </article> : <article className="chat-turn agent-turn" key={message.id} data-testid="assistant-reply">
            <div className="agent-avatar"><PetAvatar pet={pet} mood={message.safety ? 'comforting' : 'idle'} /></div>
            <div className="agent-content"><div className="agent-name">{pet.name}<span>陪伴中</span></div><div className="message agent-message">{message.text}</div><ReplyProvenance message={message} />{message.profileProposals?.map(proposal => <ProfileUpdateCard key={proposal.id} proposal={proposal} onRefresh={onDiarySaved} />)}
              {message.relaxationInvitation && <section className="relaxation-invitation" data-testid="relaxation-invitation"><p>想不想一起缓一缓？可以安静待会儿，也可以看看一个小办法。</p><div><button className="secondary-button" onClick={() => { dismissInvitation(message.id); setRelaxationOpen(true) }}>看看放松方式</button><button className="text-link" onClick={() => { dismissInvitation(message.id) }}>先不用</button></div></section>}
              {message.memories?.length > 0 && <div className="memory-citations"><span className="evidence-kicker">找到的历史记录</span>{message.memories.map(memory => <blockquote key={memory.id}><p>日记原文：“{memory.text}”</p>{memory.response_text && <p className="memory-agent-response">心栖当时回应：“{memory.response_text}”</p>}<cite>{dateLabel(memory.recorded_at)}</cite></blockquote>)}</div>}
              {message.emotionSuggestion && !message.safety && <EmotionPrompt suggestion={message.emotionSuggestion} turn={chat.find(item => item.id === message.userId) || lastUserTurn} onConfirm={label => { const linked = chat.find(item => item.id === message.userId) || lastUserTurn; if (linked) setTurnEmotion(linked.id, label) }} editing={editEmotionFor === message.id} onEdit={() => setEditEmotionFor(editEmotionFor === message.id ? null : message.id)} />}
              {message.suggestion && <AdviceCard requestBusy={sending} seenIds={message.excludedAdviceIds} advice={message.suggestion} onAlternative={excluded => send(message.adviceContext || chat.find(item => item.id === message.userId)?.text || '我现在想放松一下。', true, null, '这个办法有些费力，请换一个更轻松的建议。', excluded)} onFeedback={async (action, experience, adviceId, remember = false) => {
                await request('/feedback', json('POST', { recommendation_id: adviceId, action, experience, remember_preference: remember }))
                if (['reject', 'uncomfortable', 'modify'].includes(action)) declinedAdvice.current.add(adviceId)
                if (remember) await onDiarySaved()
                setNotice(remember ? '已确认长期避开，可在「我的」修改或删除；使用遵循记忆开关。' : ['reject', 'uncomfortable'].includes(action) ? '本次会话不再推荐这个办法，不会自动记成长期偏好。' : action === 'modify' ? '已按你的反馈调整这次建议。' : '已记下你愿意尝试。')
              }} />}
              {message.id === lastAssistantTurn?.id && !message.safety && !message.suggestion && <div className="turn-actions"><button className="inline-action" onClick={() => send(chat.find(item => item.id === message.userId)?.text || '', true)} disabled={!message.userId || sending}>给我一个小建议</button>{message.userId && !savedIds.includes(message.userId) && <button className="inline-action secondary-action" disabled={!saveEnabled || savingTurns.includes(message.userId)} onClick={() => saveTurn(message)}>{savingTurns.includes(message.userId) ? '正在加入记忆库…' : '加入 Agent 记忆库'}</button>}</div>}
              {message.suggestion && message.id === lastAssistantTurn?.id && message.userId && !savedIds.includes(message.userId) && <button className="inline-action secondary-action" disabled={!saveEnabled || savingTurns.includes(message.userId)} onClick={() => saveTurn(message)}>{savingTurns.includes(message.userId) ? '正在加入记忆库…' : '加入 Agent 记忆库'}</button>}
            </div>
          </article>)}
          {sending && <div className="typing-state"><span /><span /><span />{pet.name}在想怎么回应</div>}
          <div ref={messagesEnd} />
        </div>
        {saveError && <p className="inline-error" role="alert">{saveError}</p>}
        {!saveEnabled && <p className="save-disabled-note">新记录保存已关闭。当前聊天不会自动保存。</p>}
        <form className="composer" onSubmit={event => { event.preventDefault(); send() }}>
          <div className="composer-shortcuts"><button type="button" className="text-link" disabled={sending} onClick={() => send(ACTIVITY_PROMPT)}>一起找个小活动</button></div>
          <label className="sr-only" htmlFor="chat-message">和{pet.name}说说今天</label>
          <textarea ref={composerInput} id="chat-message" maxLength={CHAT_TEXT_LIMIT} placeholder="今天有什么想和我说的？" value={draft} onChange={event => { setDraft(event.target.value); setPetMood(event.target.value ? 'listening' : 'idle') }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} rows={2} />
          <div className="composer-footer"><details className="composer-settings"><summary>聊天设置<span> · {!saveEnabled ? '保存已关闭' : saveToMemory ? saveReply ? '保存原话和回应' : '保存原话' : '本次不保存'}</span></summary><div className="composer-settings-panel" role="region" aria-label="聊天保存设置"><div className="send-mode" role="radiogroup" aria-label="聊天记忆保存"><label><input type="radio" name="chat-memory" checked={saveToMemory && saveEnabled} disabled={!saveEnabled || sending} onChange={() => { setSaveToMemory(true); }} />保存到 Agent 记忆库</label><label><input type="radio" name="chat-memory" checked={!saveToMemory || !saveEnabled} disabled={sending} onChange={() => { setSaveToMemory(false); }} />不保存</label></div>
          <label className="chat-response-consent"><input type="checkbox" checked={saveReply} disabled={sending || !saveEnabled} onChange={e => { setSaveReply(e.target.checked); }} />同时保存心栖回应</label>
          {saveReply && <p className="chat-memory-note">仅在你选择保存时，原话和回应才一起写入日记；回应会单独标明来源，也可用于后续记忆检索。</p>}
          <p className="chat-memory-note">{saveToMemory && saveEnabled ? `每条消息都会得到回复；你的原话会保存到日记，${memoryEnabled ? '可供以后记忆检索。' : '记忆调用已关闭，暂不参与检索。'}` : '每条消息都会得到回复；原话仅用于当前会话，不写入日记。个人资料需另行确认才保存。'}</p>
          </div></details><span>按 Enter 发送 · Shift + Enter 换行</span><button className="primary-button" type="submit" disabled={!draft.trim() || sending}>发送</button></div>
        </form>
      </section>
      <aside className="companion-aside"><CompanionTools diaries={diaries} memoryEnabled={memoryEnabled} onOpenDiaries={openDiaryFromChat} /></aside>
    </div>
  </div>
}

function FloatingToolsButton({ expanded, onOpen }) {
  const button = useRef(null)
  const drag = useRef(null)
  const suppressClick = useRef(false)
  const customPosition = useRef(false)
  const [position, setPosition] = useState(null)
  const [moving, setMoving] = useState(false)
  const clamp = value => ({ x: Math.max(8, Math.min(value.x, window.innerWidth - 56)), y: Math.max(8, Math.min(value.y, window.innerHeight - 60)) })
  useEffect(() => {
    let initial = null
    try {
      const stored = JSON.parse(localStorage.getItem('heart-tools-position'))
      if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) { initial = stored; customPosition.current = true }
    } catch { /* Use the default position if storage is unavailable. */ }
    const place = () => {
      if (customPosition.current) setPosition(value => clamp(value || initial))
      else {
        const header = document.querySelector('.nature-topline')?.getBoundingClientRect()
        setPosition(clamp({ x: window.innerWidth <= 650 ? window.innerWidth - 56 : (header?.left || 64) - 56, y: (header?.bottom || 90) + 10 }))
      }
    }
    place(); window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [])
  const finish = event => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    if (current.moved) {
      suppressClick.current = true; customPosition.current = true
      try { localStorage.setItem('heart-tools-position', JSON.stringify(current.last)) } catch { /* Dragging still works without storage. */ }
    }
    const touchTap = !current.moved && event.type === 'pointerup' && event.pointerType === 'touch'
    if (touchTap) suppressClick.current = true
    drag.current = null; setMoving(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (touchTap) onOpen()
  }
  return <button ref={button} type="button" className={`companion-bookmark floating-tools ${moving ? 'is-dragging' : ''}`} style={position ? { left: position.x, top: position.y } : undefined} aria-label="打开陪伴工具" title="点击打开工具，按住可拖动" aria-haspopup="dialog" aria-expanded={expanded} aria-controls={expanded ? 'companion-tools-drawer' : undefined}
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0) return
      suppressClick.current = false
      const rect = event.currentTarget.getBoundingClientRect()
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, start: { x: rect.left, y: rect.top }, last: { x: rect.left, y: rect.top }, moved: false }
      event.currentTarget.setPointerCapture(event.pointerId)
    }}
    onPointerMove={event => {
      const current = drag.current
      if (!current || current.pointerId !== event.pointerId) return
      const dx = event.clientX - current.x, dy = event.clientY - current.y
      if (!current.moved && Math.hypot(dx, dy) < 6) return
      current.moved = true; current.last = clamp({ x: current.start.x + dx, y: current.start.y + dy })
      setMoving(true); setPosition(current.last)
    }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    onClick={event => { if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return } onOpen() }}>
    <svg viewBox="0 0 24 28" aria-hidden="true"><path d="M4 2h16v24l-8-5-8 5Z"/><path d="M8 9h8M8 13h8"/></svg><span>工具</span>
  </button>
}

function CompanionTools({ diaries, memoryEnabled, onOpenDiaries }) {
  return <>
        <section className="aside-section diary-shortcut"><span className="eyebrow">心情日记</span><h2>想慢慢写，也可以。</h2><p>聊天始终会回应。选择加入记忆库的原话，也可以在日记中回看。</p><button className="secondary-button" onClick={() => onOpenDiaries()}>打开我的日记</button></section>
        <section className="aside-section recent-notes"><div className="aside-heading"><span className="eyebrow">最近记录</span><button className="text-link" onClick={() => onOpenDiaries()}>全部</button></div>{diaries.slice(0, 2).map(diary => <button className="recent-note" key={diary.id} onClick={() => onOpenDiaries(diary.id)}><span>{dateLabel(diary.recorded_at)}</span><strong>{diary.text}</strong><small>{diary.emotion_confirmed ? diary.emotion.label : '情绪待确认'}</small></button>)}{!diaries.length && <p className="quiet-empty">这里会显示你选择保存的日记。</p>}</section>
        <p className="privacy-note">{memoryEnabled ? '你已允许心栖在聊天中查找旧日记。' : '记忆调用关闭中，心栖不会引用旧日记。'}</p>
  </>
}

function CompanionToolsDrawer({ children, onClose }) {
  const ref = useRef(null)
  const containFocus = event => {
    if (event.key !== 'Tab') return
    const controls = [...ref.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length)
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  useEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
      if (opener?.isConnected && opener.getClientRects().length) opener.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={ref} id="companion-tools-drawer" className="companion-tools-dialog" aria-labelledby="companion-tools-title" onKeyDown={containFocus} onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="companion-drawer-panel"><header className="companion-drawer-heading"><div><p className="eyebrow">书签里的小角落</p><h2 id="companion-tools-title">陪伴工具</h2></div><button type="button" className="text-link" aria-label="关闭陪伴工具" onClick={onClose}>关闭 ×</button></header><div className="companion-drawer-content">{children}</div></section>
  </dialog>
}

function ReplyProvenance({ message }) {
  if (!message.replySource || message.replySource === 'safety') return null
  const fallback = { disabled: '当前未开启在线模型，使用本地回应。', unconfigured: '在线模型尚未配置，使用本地回应。', unavailable: '在线模型暂不可用，已用本地回应陪你聊。' }
  const summary = message.replySource === 'llm' ? 'AI 陪伴回应' : message.replySource === 'memory' ? '历史记录检索' : message.replySource === 'advice' ? '来源库小练习' : message.fallbackReason === 'unavailable' ? '模型暂不可用 · 本地回应' : '本地回应'
  return <details className="reply-provenance" data-testid="reply-provenance"><summary>{summary}</summary>
    <p>{message.replySource === 'llm' ? '这段回应由在线模型生成，不代表诊断或专业审核结论。' : message.replySource === 'memory' ? '这里按记忆授权检索实际保存的记录；没有匹配时不会编造。' : message.replySource === 'advice' ? '小办法来自已有来源库，可在建议卡查看依据与适用范围。' : fallback[message.fallbackReason] || '这段回应来自本地陪伴规则。'}</p>
    {message.emotionSuggestion && message.understandingSource && <p>情绪初判：{message.understandingSource === 'llm' ? '在线模型理解' : '本地规则'}，仅供参考，以你的确认和修改为准。</p>}
  </details>
}

function EmotionPrompt({ suggestion, turn, onConfirm, editing, onEdit }) {
  const [selected, setSelected] = useState(suggestion.label)
  const [skipped, setSkipped] = useState(false)
  useEffect(() => setSelected(suggestion.label), [suggestion.label])
  if (turn?.emotionLabel && !editing) return <div className="emotion-confirmed">已标记为“{turn.emotionLabel}”<button className="text-link" onClick={onEdit}>修改</button></div>
  if (skipped) return <div className="emotion-skipped">情绪标记已跳过<button className="text-link" onClick={() => setSkipped(false)}>重新选择</button></div>
  return <details className="emotion-prompt" open={editing || undefined}>
    <summary>心情初判 · {suggestion.label}<span>确认或修改</span></summary>
    <div className="emotion-prompt-body"><p>只是初步理解，以你的感受为准。</p><div className="emotion-prompt-actions"><button className="tag-choice" onClick={() => { onConfirm(suggestion.label); if (editing) onEdit() }}>差不多</button><button className="text-link" onClick={onEdit}>换一个</button><button className="text-link" onClick={() => { setSkipped(true); }}>先跳过</button></div>{editing && <div className="emotion-choices">{EMOTIONS.map(label => <button key={label} className={selected === label ? 'emotion-choice selected' : 'emotion-choice'} onClick={() => { setSelected(label); onConfirm(label); onEdit() }}>{label}</button>)}</div>}</div>
  </details>
}

function AdviceCard({ advice, onFeedback, onAlternative, seenIds, requestBusy = false }) {
  const [showEvidence, setShowEvidence] = useState(false)
  const current = advice
  const seen = seenIds || [advice.id]
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [rememberAvoidance, setRememberAvoidance] = useState(false)

  const choose = async (action, experience, confirmation) => {
    if (busy || requestBusy) return
    setBusy(true)
    try {
      await onFeedback(action, experience, current.id, ['reject', 'uncomfortable'].includes(action) && rememberAvoidance)
      if (action === 'modify') {
        const response = await onAlternative(seen)
        if (response?.suggestion) { setFeedback('新建议已在下方回复，原建议保留。'); return }
        else { setFeedback(response?.reply || '新建议暂时没有送达，可以在下方重试。'); return }
      }
      setFeedback(confirmation)
    }
    catch { setFeedback('这次选择没有保存成功，请稍后重试。'); }
    finally { setBusy(false) }
  }
  return <section className="advice-card" data-testid="advice-card">
    <div className="advice-label"><span className="advice-mark">一步</span><span>一个可选的小办法</span></div>
    <h3>{current.title}</h3><p>{current.step}</p>
    <div className="advice-actions">
      <button disabled={busy || requestBusy} className="tag-choice" onClick={() => choose('accept', '愿意尝试', '已记下你愿意尝试。')}>试一下</button>
      <button disabled={busy || requestBusy} className="text-link" onClick={() => choose('modify', '换一种练习', '换了一种练习，你可以看看是否适合。')}>换个更轻松的</button>
      <button disabled={busy || requestBusy} className="text-link" onClick={() => choose('reject', '这次不想尝试', '这次先不做，没关系。')}>先不用</button>
      <button disabled={busy || requestBusy} className="text-link" onClick={() => choose('uncomfortable', '尝试后不舒服', '先停下这个办法，不必坚持。想换一个或只聊聊都可以。')}>做了不舒服</button>
    </div>
    <label className="advice-remember"><input type="checkbox" checked={rememberAvoidance} disabled={busy || requestBusy} onChange={event => setRememberAvoidance(event.target.checked)} />拒绝或不适时，也确认以后避开这个办法</label>
    <small className="advice-consent-note">默认只影响本次会话。确认后可在「我的」修改或删除，使用遵循记忆开关。</small>
    {feedback && <p className="advice-feedback" role="status">{feedback}</p>}
    <button className="evidence-toggle" aria-expanded={showEvidence} onClick={() => setShowEvidence(value => !value)}>{showEvidence ? '收起依据与适用范围' : '依据与适用范围'}</button>
    {showEvidence && <div className="evidence-detail">
      <strong>为什么推荐 · {({ literature: '文献支持', preference: '个人偏好', both: '文献与个人偏好' })[current.basis?.type] || '文献支持'}</strong>
      {current.reason && <p>{current.reason}</p>}
      {current.basis?.preferences?.map((preference, index) => <p key={index}>偏好来源：{preference.origin === 'confirmed_profile' ? '已确认且获授权的画像' : preference.origin === 'current_conversation' ? '本次对话' : '当前表达'} · {preference.content}</p>)}
      <p>{current.adaptation}</p><p>{current.limitation}</p>
      {(current.basis?.sources || (current.source ? [current.source] : [])).map(source => <p key={source.id || source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} · {source.publisher} · {source.year}</a>{source.review_scope && <small>{source.review_scope}</small>}</p>)}
      {current.basis?.type === 'preference' && <p>此项根据个人喜好选择，不作为已有研究证实的疗效结论。</p>}
    </div>}
  </section>
}

function DiaryPage({ view = 'list', onCreated, diaries, saveEnabled, responsePreference, onRefresh, initialId, openVersion }) {
  const [selectedId, setSelectedId] = useState(initialId)
  const [editDraft, setEditDraft] = useState('')
  useEffect(() => {
    setSelectedId(initialId); setEditing(false); setDeleteConfirm(false); setSupplement(''); setLocalError('')
    if (!initialId) document.getElementById('journal-draft')?.focus()
  }, [initialId, openVersion])
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [emotion, setEmotion] = useState('')
  const [journalMode, setJournalMode] = useState('save')
  const [allowRetrieval, setAllowRetrieval] = useState(true)
  const [pendingResponse, setPendingResponse] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [supplement, setSupplement] = useState('')
  const [localError, setLocalError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  useEffect(() => {
    setEditing(false); setDeleteConfirm(false); setSupplement(''); setLocalError(''); setEditDraft('')
    const pane = document.querySelector('.diary-detail-pane')
    if (pane) { pane.scrollTop = 0; if (selectedId && window.matchMedia('(max-width: 1100px)').matches) pane.focus({ preventScroll: true }) }
  }, [selectedId])
  const selected = diaries.find(item => item.id === selectedId)
  const filtered = diaries.filter(item => !query || item.text.includes(query) || item.addenda?.some(note => note.text.includes(query)))

  const saveDiary = async ({ mode = 'save', responseRequested = false, responseText = null } = {}) => {
    const item = await request('/diaries', json('POST', { kind: 'diary', text: draft.trim(), mode, response_requested: responseRequested, response_text: responseText, allow_retrieval: allowRetrieval }))
    if (emotion) await request(`/diaries/${item.id}/emotion`, json('PATCH', { label: emotion, status: 'confirmed' }))
    setDraft(''); setEmotion(''); setPendingResponse(null); setJournalMode('save'); await onRefresh(); setSelectedId(item.id); onCreated?.(item.id)
  }

  const create = async event => {
    event.preventDefault()
    if (!draft.trim() || !saveEnabled) return
    setSaving(true); setLocalError('')
    try {
      if (journalMode === 'respond' && !pendingResponse) {
        const response = await request('/companion/respond', json('POST', { text: draft.trim(), want_advice: false, response_preference: responsePreference, conversation: [] }))
        setPendingResponse({ text: draft.trim(), response: response.reply })
      } else if (journalMode === 'respond' && pendingResponse) {
        await saveDiary({ mode: 'respond', responseRequested: true, responseText: pendingResponse.response })
      } else {
        await saveDiary()
      }
    } catch { setLocalError('没有保存成功，内容还留在编辑区。请检查设置或稍后重试。') }
    finally { setSaving(false) }
  }

  const keepOriginalOnly = async () => {
    if (!pendingResponse || !saveEnabled) return
    setSaving(true); setLocalError('')
    try { await saveDiary() } catch { setLocalError('原文没有保存成功，请重试。') } finally { setSaving(false) }
  }

  const saveEdit = async () => {
    if (!editDraft.trim()) return
    setSaving(true); setLocalError('')
    try { await request(`/diaries/${selected.id}`, json('PATCH', { text: editDraft.trim() })); setEditing(false); await onRefresh() }
    catch { setLocalError('修改没有保存成功，文本仍保留在编辑区。') }
    finally { setSaving(false) }
  }
  const addSupplement = async event => {
    event.preventDefault()
    if (!supplement.trim()) return
    try { await request(`/diaries/${selected.id}/addenda`, json('POST', { text: supplement.trim() })); setSupplement(''); await onRefresh() }
    catch { setLocalError('补充内容没有保存，请重试。') }
  }
  const confirmEmotion = async label => {
    try { await request(`/diaries/${selected.id}/emotion`, json('PATCH', { label, status: 'confirmed' })); await onRefresh() }
    catch { setLocalError('情绪标签没有更新，请重试。') }
  }
  const removeDiary = async () => {
    try { await request(`/diaries/${selected.id}`, { method: 'DELETE' }); setSelectedId(null); setDeleteConfirm(false); await onRefresh() }
    catch { setLocalError('日记没有删除，请重试。') }
  }

  return <div className="diary-view">

    {!saveEnabled && <div className="inline-alert">新记录保存已关闭。你仍然可以查看和编辑已有日记。</div>}
    {view === 'write' ? <section className="diary-write-page" aria-label="写日记">
        <form className="journal-composer" onSubmit={create}><label htmlFor="journal-draft">写一篇新的日记</label><textarea id="journal-draft" placeholder="把想留下来的部分写在这里。可以是一件事、一种感觉，也可以只写一句。" value={draft} onChange={event => setDraft(event.target.value)} disabled={!saveEnabled} />
          <div className="journal-prompts"><span>可以从这里开始</span>{['今天发生了什么？', '此刻最明显的感受是什么？', '有什么想留给以后的自己？'].map(prompt => <button type="button" key={prompt} onClick={() => setDraft(text => `${text}${text ? '\n' : ''}${prompt}\n`)}>{prompt}</button>)}</div>
          <div className="journal-emotions"><span>情绪标记（可跳过）</span>{EMOTIONS.slice(0, 6).map(label => <button type="button" key={label} className={emotion === label ? 'emotion-choice selected' : 'emotion-choice'} aria-pressed={emotion === label} onClick={() => setEmotion(emotion === label ? '' : label)}>{label}</button>)}</div>
          <div className="journal-mode" role="radiogroup" aria-label="日记保存方式"><span>写完之后</span><label><input type="radio" name="journal-mode" value="save" checked={journalMode === 'save'} onChange={() => { setJournalMode('save'); setPendingResponse(null) }} />仅保存</label><label><input type="radio" name="journal-mode" value="respond" checked={journalMode === 'respond'} onChange={() => setJournalMode('respond')} />需要回应</label></div>
          <label className="chat-response-consent"><input type="checkbox" checked={allowRetrieval} onChange={e => setAllowRetrieval(e.target.checked)} />允许这篇日记用于记忆检索</label>
          {pendingResponse && <section className="diary-response-preview" data-testid="diary-response-preview"><p className="eyebrow">心栖的回应</p><p>{pendingResponse.response}</p><div><button type="submit" className="primary-button" disabled={saving}>保存这篇日记</button><button type="button" className="text-link" onClick={keepOriginalOnly} disabled={saving}>只保存原文</button><button type="button" className="text-link" onClick={() => setPendingResponse(null)} disabled={saving}>重新编辑</button></div></section>}
          {localError && <p className="inline-error" role="alert">{localError}</p>}{!pendingResponse && <button className="primary-button" type="submit" disabled={!draft.trim() || !saveEnabled || saving}>{saving ? '处理中…' : journalMode === 'respond' ? '先听听心栖回应' : '保存日记'}</button>}
        </form>
    </section> : <div className={`diary-layout ${selected ? 'has-selection' : ''} ${view === 'read' ? 'diary-reader-page' : ''}`}>
      {view !== 'read' && <section className="diary-list-pane" aria-label="日记记录列表"><div className="list-heading"><h2>所有记录 <small>{diaries.length}</small></h2><input aria-label="搜索日记" placeholder="搜索日记" value={query} onChange={event => setQuery(event.target.value)} /></div>

        <div className="diary-list">{filtered.map(item => <button aria-label="打开日记" className={item.id === selectedId ? 'diary-row selected' : 'diary-row'} key={item.id} onClick={() => { setSelectedId(item.id); setEditing(false); setLocalError('') }}><span className="diary-date">{dateLabel(item.recorded_at)}</span><strong>{item.text}</strong><span className="diary-meta"><i className={`mood-dot mood-${EMOTIONS.indexOf(normalizeEmotion(item.emotion?.label))}`} />{item.emotion_confirmed ? item.emotion.label : '情绪待确认'} · {item.kind === 'chat' ? '来自聊天' : '独立日记'}</span></button>)}
          {!filtered.length && <div className="empty-copy"><strong>{query ? '没有找到相关日记。' : '这里还没有记录。'}</strong><span>{query ? '换个关键词试试。' : '想写的时候再来就好。'}</span></div>}
        </div>
      </section>}
      <section className="diary-detail-pane" aria-label="日记详情" tabIndex={-1}>
        {selected && view !== 'read' && <button className="text-link diary-back-to-list" onClick={() => setSelectedId(null)}>← 返回所有记录</button>}
        {!selected ? <div className="detail-empty"><span className="detail-icon">✦</span><h2>选择一篇日记</h2><p>原文和后来补充会分开展示，方便你回来看。</p></div> : <>
          {view === 'read' && <><span className="diary-paper-corners" aria-hidden="true"><i /><i /><i /><i /></span><header className="diary-reading-heading"><p className="eyebrow">{selected.kind === 'chat' ? '从聊天中留下的一页' : '心情日记'}</p><div>{selected.emotion_confirmed && <MoodFace label={selected.emotion.label} />}<h2>{selected.emotion_confirmed ? selected.emotion.label : '这一天的记录'}</h2></div>{!selected.emotion_confirmed && <small>心情尚未确认，以你的感受为准。</small>}</header></>}
          <div className="detail-toolbar"><span>{dateLabel(selected.recorded_at)}{selected.updated_at && ` · 更新于 ${dateLabel(selected.updated_at)}`}</span><div><button className="text-link" onClick={() => { setEditing(value => !value); setEditDraft(selected.text) }}>{editing ? '取消编辑' : '编辑记录'}</button><button className="text-link danger-link" onClick={() => setDeleteConfirm(true)}>删除</button></div></div>
          <div className="entry-section"><p className="eyebrow">当时写下</p>{editing ? <><label className="sr-only" htmlFor="diary-original">日记原文</label><textarea id="diary-original" aria-label="日记原文" className="edit-diary-text" value={editDraft} onChange={event => setEditDraft(event.target.value)} /><button className="primary-button" onClick={saveEdit} disabled={saving}>保存修改</button>{localError && <p className="inline-error" role="alert">{localError}</p>}</> : <p className="entry-original">{selected.text}</p>}</div>
          {selected.response_text && <div className="entry-section diary-response-entry"><p className="eyebrow">心栖回应</p><p className="entry-original">{selected.response_text}</p></div>}
          <div className="entry-section"><SettingSwitch label="允许这篇记录用于记忆检索" description="关闭后仍保留日记，但聊天不再引用它。全局记忆关闭时也不会调用。" checked={selected.allow_retrieval !== false} onToggle={async () => { try { await request(`/diaries/${selected.id}`, json('PATCH', { allow_retrieval: selected.allow_retrieval === false })); await onRefresh() } catch { setLocalError('记忆权限没有更新，请重试。') } }} />{localError && <p role="alert" className="inline-error">{localError}</p>}</div>
          <div className="entry-section emotion-entry"><p className="eyebrow">情绪标记</p>{selected.emotion_confirmed ? <div className="confirmed-emotion">{selected.emotion.label}<button className="text-link" onClick={() => setEmotion(selected.emotion.label)}>修改</button></div> : <p className="unconfirmed-label">系统初步理解为“{selected.emotion?.label || '未识别'}”，仅供参考，可确认、修改或跳过。</p>}
            <div className="emotion-choices">{EMOTIONS.map(label => <button key={label} className={selected.emotion_confirmed && selected.emotion.label === label ? 'emotion-choice selected' : 'emotion-choice'} onClick={() => confirmEmotion(label)}>{label}</button>)}<button className="text-link" onClick={async () => { await request(`/diaries/${selected.id}/emotion`, json('PATCH', { status: 'skipped' })); await onRefresh() }}>跳过</button></div>
          </div>
          <div className="entry-section later-notes"><p className="eyebrow">后来补充</p>{(selected.addenda || []).map(note => <article className="addendum" key={note.id}><p>{note.text}</p><time>{dateLabel(note.recorded_at)}</time></article>)}<form onSubmit={addSupplement}><label className="sr-only" htmlFor="diary-supplement">后来想补充什么？</label><textarea id="diary-supplement" aria-label="后来想补充什么？" placeholder="后来想补充什么？" value={supplement} onChange={event => setSupplement(event.target.value)} /><button className="secondary-button" disabled={!supplement.trim()}>添加补充</button></form></div>
          {deleteConfirm && <div className="confirm-delete" role="alertdialog" aria-modal="true"><strong>删除这篇日记？</strong><p>删除后，这段内容也不会再出现在心栖的记忆检索中。</p><button className="text-link" onClick={() => setDeleteConfirm(false)}>保留</button><button className="danger-button" onClick={removeDiary}>确认删除</button></div>}
        </>}
      </section>
    </div>}
  </div>
}

function ReviewPage({ metrics, diaries, onOpenDiary }) {
  const entries = Object.entries(metrics.counts || {}).sort((left, right) => right[1] - left[1])
  const max = Math.max(1, ...entries.map(([, value]) => value))
  const canDraw = metrics.total_confirmed >= 3
  return <div className="review-view"><header className="page-heading"><p className="eyebrow">只展示你选择记录的日子</p><h1>最近的心情</h1><p>这里只回顾最近 7 天确认过的情绪标签，不代表这段时间的全部状态。</p></header>
    <div className="nature-review-banner"><div><MoodFace label="开心"/><MoodFace label="平稳"/><MoodFace label="低落"/></div><h2>有起伏，也有安稳的时刻。</h2><p>记录是为了理解自己，不是给状态打分。</p></div>
    <section className="review-summary"><div><span className="eyebrow">已确认记录</span><strong>{metrics.total_confirmed || 0}</strong><small>条 · 最近 7 天</small></div><div><span className="eyebrow">全部日记</span><strong>{diaries.length}</strong><small>条记录</small></div></section>
    {canDraw ? <section className="mood-chart" aria-label="最近心情记录统计">{entries.map(([label, count]) => <button className="mood-bar-row" key={label} onClick={() => onOpenDiary()}><span>{label}</span><span className="mood-bar-track"><i className={`mood-bar fill-${EMOTIONS.indexOf(normalizeEmotion(label))}`} style={{ width: `${Math.max(12, count / max * 100)}%` }} /></span><strong>{count}</strong></button>)}</section> : <section className="review-empty"><h2>{metrics.total_confirmed ? '目前记录还不多' : '还没有确认过的情绪记录'}</h2><p>多记录几次之后，再回来看看会更有参考价值。没有记录的日子不会被当作平静。</p></section>}
    <div className="review-footnote">记录可能没有覆盖每一天，也不代表完整的你。情绪统计只用于自我回看，不是心理评估。</div>
    <MoodTimeline timeline={metrics.timeline} onOpenDiary={onOpenDiary} />
    <section className="review-recent"><div className="aside-heading"><span className="eyebrow">最近确认的记录</span><button className="text-link" onClick={() => onOpenDiary()}>查看日记</button></div>{metrics.timeline.slice(-5).reverse().map(row => <button className="timeline-row" key={row.diary_id} onClick={() => onOpenDiary(row.diary_id)}><span>{dateLabel(row.date)}</span><strong>{row.label}</strong><span>打开对应日记 →</span></button>)}</section>
  </div>
}

function SettingsPage({ settings, profiles: allProfiles, pet, onUpdate, onChoosePet, onRefresh }) {
  const profiles = allProfiles.filter(p => !p.category || p.category === 'interest')
  const [profileText, setProfileText] = useState('')
  const [profileType, setProfileType] = useState('喜欢')
  const [editingProfile, setEditingProfile] = useState(null)
  const [profileBusy, setProfileBusy] = useState(false)
  const [error, setError] = useState('')
  const addProfile = async event => {
    event.preventDefault()
    if (!profileText.trim()) return
    try { await request('/profile', json('POST', { content: profileText.trim(), type: profileType, confirmed: true, status: 'active' })); setProfileText(''); await onRefresh() }
    catch { setError('偏好没有保存，请重试。') }
  }
  const removeProfile = async id => { try { await request(`/profile/${id}`, { method: 'DELETE' }); await onRefresh() } catch { setError('偏好没有删除，请重试。') } }
  const saveProfile = async event => {
    event.preventDefault(); setProfileBusy(true); setError('')
    try {
      await request(`/profile/${editingProfile.id}`, json('PATCH', { content: editingProfile.content.trim(), type: editingProfile.type, status: editingProfile.type === '反感' ? 'rejected' : 'active', confirmed: true }))
      await onRefresh(); setEditingProfile(null)
    } catch { setError('偏好修改没有保存，请重试。') }
    finally { setProfileBusy(false) }
  }
  const toggle = key => onUpdate({ [key]: !settings[key] }).catch(() => setError('设置没有更新，请重试。'))
  return <div className="settings-view"><header className="page-heading"><p className="eyebrow">由你决定</p><h1>我的小小角落</h1><p>角色、保存和记忆调用都可以随时调整。</p></header>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <section className="settings-section pet-setting"><div><p className="eyebrow">我的伙伴</p><h2>{pet.name} · {pet.kind}</h2><p>{pet.intro}</p></div><PetAvatar pet={pet} mood="idle" /><button className="secondary-button" onClick={onChoosePet}>更换伙伴</button></section>
    <section className="settings-section"><p className="eyebrow">隐私与记录</p>
      <SettingSwitch label="保存我之后写下的内容" description="关闭后，新的聊天和日记不会写入历史。已有记录仍可查看。" checked={settings.save_enabled} onToggle={() => toggle('save_enabled')} />
      <SettingSwitch label="允许心栖在聊天时查找旧日记" description="只在聊天中检索你保存且允许调用的记录。关闭后，日记仍可由你自己查看。" checked={settings.memory_enabled} onToggle={() => toggle('memory_enabled')} />
    </section>
    <section className="settings-section"><p className="eyebrow">陪伴习惯</p><label className="form-label" htmlFor="settings-nickname">我该怎么称呼你？</label><div className="settings-inline"><input id="settings-nickname" className="text-input" maxLength={40} key={settings.nickname} defaultValue={settings.nickname} onBlur={event => { if (event.target.value !== settings.nickname) onUpdate({ nickname: event.target.value }).catch(() => setError('称呼没有保存，请重试。')) }} /></div><fieldset className="response-preference"><legend className="form-label">我更喜欢这样的回应</legend><div className="preference-options">{[['listen_first', '先听我说'], ['think_together', '一起想办法'], ['adapt', '看当下情况']].map(([value, label]) => <button type="button" key={value} className={settings.response_preference === value ? 'preference-option selected' : 'preference-option'} aria-pressed={settings.response_preference === value} onClick={() => onUpdate({ response_preference: value }).catch(() => setError('偏好没有更新，请重试。'))}>{label}</button>)}</div></fieldset></section>
    <section className="settings-section profile-settings"><div className="aside-heading"><div><p className="eyebrow">确认过的偏好</p><h2>只记住你确认过的事</h2></div><span>{profiles.length} 条</span></div>{profiles.map(profile => <article className="profile-setting-row" key={profile.id}>{editingProfile?.id === profile.id ? <form className="profile-edit-form" onSubmit={saveProfile}><label>修改偏好内容<input className="text-input" value={editingProfile.content} onChange={e => setEditingProfile(p => ({ ...p, content: e.target.value }))} /></label><label>修改偏好类型<select className="select-input" value={editingProfile.type} onChange={e => setEditingProfile(p => ({ ...p, type: e.target.value }))}>{['喜欢', '反感', '想尝试', '已体验'].map(type => <option key={type}>{type}</option>)}</select></label><button className="secondary-button" disabled={profileBusy || !editingProfile.content.trim()}>保存偏好</button><button type="button" className="text-link" disabled={profileBusy} onClick={() => setEditingProfile(null)}>取消</button></form> : <><div><strong>{profile.content}</strong><span>{profile.type} · {profile.confirmed ? '已确认' : '待确认'}</span><small>{profile.source_id ? `来自日记 ${profile.source_id}` : profile.source_feedback_id ? `来自活动反馈 ${profile.source_feedback_id}` : '手动添加'} · {dateLabel(profile.updated_at || profile.created_at)}</small></div><div><button className="text-link" onClick={() => setEditingProfile({ ...profile })}>编辑</button><button className="text-link danger-link" onClick={() => removeProfile(profile.id)}>删除</button></div></>}</article>)}
      <form className="profile-add-form" onSubmit={addProfile}><input aria-label="偏好内容" className="text-input" placeholder="例如：喜欢安静的散步" value={profileText} onChange={event => setProfileText(event.target.value)} /><select aria-label="偏好类型" className="select-input" value={profileType} onChange={event => setProfileType(event.target.value)}><option>喜欢</option><option>反感</option><option>想尝试</option><option>已体验</option></select><button className="secondary-button" disabled={!profileText.trim()}>添加偏好</button></form>
    </section>
    <FlexibleProfileNotes profiles={allProfiles.filter(p => ['habit', 'trait'].includes(p.category))} onRefresh={onRefresh} /><p className="settings-footnote">聊天默认不会自动变成日记。你可以分别关闭保存与记忆调用。</p>
  </div>
}

const PROFILE_KIND_LABELS = { nickname: '称呼', response_preference: '回应方式', habit: '小习惯', trait: '个人特征' }
const RESPONSE_LABELS = { listen_first: '先听我说', think_together: '一起想办法', adapt: '看当下情况' }

function ProfileUpdateCard({ proposal, onRefresh }) {
  const [status, setStatus] = useState('pending')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const act = async action => {
    setBusy(true); setError('')
    try {
      await request(`/profile/proposals/${proposal.id}/${action}`, { method: 'POST' })
      setStatus(action === 'confirm' ? 'confirmed' : 'dismissed')
      if (action === 'confirm') await onRefresh()
    } catch { setError('这次操作没有完成，请重试；如果提议已过期，请重新告诉我。'); }
    finally { setBusy(false) }
  }
  return <section className="profile-update-card" aria-label="个人资料更新确认">
    <strong>{status === 'confirmed' ? '已更新到「我的」' : status === 'dismissed' ? '这次不记录' : `要更新你的${PROFILE_KIND_LABELS[proposal.kind]}吗？`}</strong>
    <p>{proposal.kind === 'response_preference' ? RESPONSE_LABELS[proposal.content] : proposal.content}</p>
    {status === 'pending' && <><details><summary>查看原话与保存范围</summary><blockquote>{proposal.evidence}</blockquote><small>确认只保存这一项资料，不会自动保存整段聊天。可在「我的」修改或删除。</small></details><div className="profile-card-actions"><button className="secondary-button" disabled={busy} onClick={() => act('confirm')}>确认更新</button><button className="text-link" disabled={busy} onClick={() => act('dismiss')}>暂不记录</button></div></>}
    {error && <p role="alert" className="inline-error">{error}</p>}
  </section>
}

function FlexibleProfileNotes({ profiles, onRefresh }) {
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mutate = async (id, method, body) => {
    setBusy(true); setError('')
    try { await request(`/profile${id ? `/${id}` : ''}`, body ? json(method, body) : { method }); await onRefresh(); setEditing(null) }
    catch { setError('没有保存成功，请检查是否与已有内容重复后重试。') }
    finally { setBusy(false) }
  }
  return <section className="settings-section flexible-profile"><p className="eyebrow">由你确认的小习惯与个人特征</p><h2>关于我的一些小事</h2><p>只记录你愿意留下的特点，和兴趣偏好分开整理。</p>
    {!profiles.length && <p className="quiet-empty">还没有记录。聊天中发现的小习惯，会先问过你。</p>}
    {profiles.map(item => <article className="profile-setting-row" key={item.id}><div><strong>{item.content}</strong><span>{PROFILE_KIND_LABELS[item.category]} · 已确认</span><small>{item.source === 'conversation' ? '来自对话，经你确认' : '由你填写'} · {dateLabel(item.updated_at || item.created_at)}</small>{item.source_text && <details><summary>查看来源原话</summary><blockquote>{item.source_text}</blockquote></details>}</div><div><button className="text-link" disabled={busy} onClick={() => setEditing({ ...item })}>编辑小事</button><button className="text-link danger-link" disabled={busy} onClick={() => mutate(item.id, 'DELETE')}>删除小事</button></div></article>)}
    {editing ? <form className="profile-edit-form" onSubmit={e => { e.preventDefault(); mutate(editing.id, editing.id ? 'PATCH' : 'POST', { content: editing.content.trim(), category: editing.category, type: PROFILE_KIND_LABELS[editing.category], confirmed: true }) }}><label>小事内容<textarea className="text-input" maxLength={200} value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })} /></label><label>小事类型<select className="select-input" value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })}><option value="habit">小习惯</option><option value="trait">个人特征</option></select></label><button className="secondary-button" disabled={busy || !editing.content.trim()}>保存小事</button><button type="button" className="text-link" onClick={() => setEditing(null)}>取消</button></form> : <button className="secondary-button" onClick={() => setEditing({ content: '', category: 'habit' })}>补充一件小事</button>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </section>
}

function SettingSwitch({ label, description, checked, onToggle }) {
  return <div className="setting-row"><span><strong>{label}</strong><small>{description}</small></span><button type="button" role="switch" aria-label={label} aria-checked={checked} className={checked ? 'switch on' : 'switch'} onClick={onToggle}><i /></button></div>
}

function PetPicker({ currentPet, onChoose, onClose }) {
  return <div className="onboarding-backdrop"><section className="onboarding-panel pet-picker-panel" role="dialog" aria-modal="true" aria-labelledby="pet-picker-title"><button className="modal-close" aria-label="关闭选择" onClick={onClose}>×</button><p className="eyebrow">陪伴伙伴</p><h1 id="pet-picker-title">想换一位伙伴吗？</h1><div className="pet-selection-grid">{PETS.map(pet => <button key={pet.id} className={pet.id === currentPet.id ? 'pet-selection selected' : 'pet-selection'} onClick={() => onChoose(pet.id)}><PetAvatar pet={pet} mood="idle" large /><span className="pet-name">{pet.name}<small>{pet.kind}</small></span><span className="pet-intro">“{pet.intro}”</span><span className="choose-pet">选择 {pet.name}</span></button>)}</div></section></div>
}

function PetAvatar({ pet, mood = 'idle', large = false, animated = false }) {
  return <SpritePet pet={pet} mood={mood} label={`${pet.name}陪伴中`} large={large} animated={animated} />
}

function SpritePet({ pet, mood, label, large, animated }) {
  const assetPet = pet.id === 'otter' ? 'mumu' : pet.id
  const state = mood === 'listening' ? 'listening' : mood === 'thinking' ? 'thinking' : mood === 'comforting' ? 'comforting' : mood === 'encouraging' ? 'encouraging' : mood === 'resting' ? 'resting' : 'idle'
  const source = animated ? `/pets/${assetPet}/${state}.gif?v=20261101-gif3` : `/pets/${assetPet}/idle-0.png`
  return <span className={`sprite-pet ${large ? 'large' : ''}`} role="img" aria-label={label} data-testid={`${pet.id === 'otter' ? 'mumu' : pet.id}-sprite`} data-motion={animated ? 'animated' : 'static'}><img src={source} alt="" /></span>
}

function PetDock({ pet, mood, page, position, onMove, onOpen, onChange }) {
  const ref = useRef(null)
  const drag = useRef(null)
  const suppressClick = useRef(false)
  const [moving, setMoving] = useState(false)
  const style = position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined
  useEffect(() => {
    const clamp = () => { const rect = ref.current?.getBoundingClientRect(); if (!rect?.width || !rect.height) return; const next = { x: Math.max(0, Math.min(innerWidth - rect.width, position?.x ?? rect.left)), y: Math.max(0, Math.min(innerHeight - rect.height, position?.y ?? rect.top)) }; if (!position || next.x !== position.x || next.y !== position.y) storePosition(next) }
    const storePosition = next => { onMove(next); localStorage.setItem('heart-pet-position', JSON.stringify(next)) }
    const observer = new ResizeObserver(clamp)
    if (ref.current) observer.observe(ref.current)
    window.addEventListener('resize', clamp); clamp(); return () => { window.removeEventListener('resize', clamp); observer.disconnect() }
  }, [position, onMove])
  const begin = event => { const button = event.target.closest('button'); if (button && !button.classList.contains('pet-dock-avatar')) return; if (event.button !== undefined && event.button !== 0) return; const rect = ref.current.getBoundingClientRect(); drag.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false, capture: button || ref.current }; drag.current.capture.setPointerCapture?.(event.pointerId) }
  const move = event => { if (!drag.current) return; const dx = event.clientX - drag.current.x; const dy = event.clientY - drag.current.y; if (Math.abs(dx) + Math.abs(dy) > 5) drag.current.moved = true; if (!drag.current.moved) return; const rect = ref.current.getBoundingClientRect(); const next = { x: Math.max(0, Math.min(innerWidth - rect.width, drag.current.left + dx)), y: Math.max(0, Math.min(innerHeight - rect.height, drag.current.top + dy)) }; onMove(next); localStorage.setItem('heart-pet-position', JSON.stringify(next)); setMoving(true); event.preventDefault() }
  const end = event => { const capture = drag.current?.capture; if (drag.current?.moved && event.type !== 'pointercancel') { suppressClick.current = true; setTimeout(() => { suppressClick.current = false }, 0) } drag.current = null; setMoving(false); if (capture?.hasPointerCapture(event.pointerId)) capture.releasePointerCapture(event.pointerId) }
  const preventDragClick = event => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation() } }
  const bubble = mood === 'listening' ? '我在听。' : mood === 'thinking' ? '让我想一想。' : '想说话时，点我就好。'
  const pageClass = page === '陪伴' ? 'companion-page-dock' : page === '日记' ? 'diary-page-dock' : 'utility-page-dock'
  return <aside ref={ref} className={`pet-dock ${pageClass} ${moving ? 'moving' : ''}`} style={style} data-testid="pet-dock" onClickCapture={preventDragClick} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { drag.current = null; setMoving(false) }}>
    <div className="pet-bubble">{bubble}</div><button className="pet-dock-avatar" aria-label={`和${pet.name}聊聊`} onClick={onOpen}><PetAvatar pet={pet} mood={mood} animated /></button>
    <div className="pet-dock-actions"><button onClick={onOpen}>和{pet.name}聊聊</button><button aria-label="更换陪伴伙伴" onClick={onChange}>更换</button></div>
  </aside>
}

createRoot(document.getElementById('root')).render(<ProductApp />)
