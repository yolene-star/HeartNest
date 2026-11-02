import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './product.css'
import './interaction.css'

const API = '/api'
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

  const refresh = useCallback(async () => {
    const [diaryResult, profileResult, settingsResult, metricsResult] = await Promise.all([
      request('/diaries'), request('/profile'), request('/settings'), request('/metrics/emotions?days=7'),
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

  return <div className="product-shell">
    <header className="product-header">
      <button className="wordmark" onClick={() => setPage('陪伴')} aria-label="回到陪伴首页"><span className="wordmark-symbol">心</span><span><strong>心栖</strong><small>情绪陪伴与日记</small></span></button>
      <nav className="primary-nav" aria-label="主导航">
        {['陪伴', '日记', '日历', '回顾', '设置'].map(item => <button key={item} className={page === item ? 'nav-link active' : 'nav-link'} onClick={() => setPage(item)}>{item}</button>)}
      </nav>
      <span className="privacy-indicator"><i className={settings.memory_enabled ? 'status-led on' : 'status-led'} />{settings.memory_enabled ? '记忆调用已开启' : '记忆调用已关闭'}</span>
    </header>

    <main className="product-main">
      {error && <div className="inline-alert error-alert" role="alert">{error}<button onClick={() => { setError(''); refresh().catch(() => setError('服务仍不可用，请稍后重试。')) }}>重试</button></div>}
      {notice && <div className="inline-alert success-alert" role="status">{notice}<button aria-label="关闭提示" onClick={() => setNotice('')}>收起</button></div>}
      {page === '陪伴' && <CompanionPage pet={currentPet} nickname={settings.nickname} responsePreference={settings.response_preference} diaries={diaries} memoryEnabled={settings.memory_enabled} saveEnabled={settings.save_enabled} setPetMood={setPetMood} setNotice={setNotice} onDiarySaved={refresh} onOpenDiaries={() => setPage('日记')} />}
      {page === '日记' && <DiaryPage diaries={diaries} saveEnabled={settings.save_enabled} responsePreference={settings.response_preference} onRefresh={refresh} />}
      {page === '日历' && <MoodCalendar onOpenDiary={() => setPage('日记')} />}
      {page === '回顾' && <ReviewPage metrics={metrics} diaries={diaries} onOpenDiary={() => setPage('日记')} />}
      {page === '设置' && <SettingsPage settings={settings} profiles={profiles} pet={currentPet} onUpdate={updateSettings} onChoosePet={() => setShowPetPicker(true)} onRefresh={refresh} />}
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

function CompanionPage({ pet, nickname, responsePreference, diaries, memoryEnabled, saveEnabled, setPetMood, setNotice, onDiarySaved, onOpenDiaries }) {
  const [chat, setChat] = useState([])
  const [draft, setDraft] = useState('')
  const [sendMode, setSendMode] = useState('respond')
  const [sending, setSending] = useState(false)
  const [savedIds, setSavedIds] = useState([])
  const [editEmotionFor, setEditEmotionFor] = useState(null)
  const [saveError, setSaveError] = useState('')
  const messagesEnd = useRef(null)
  const composerInput = useRef(null)
  const lastUserTurn = useMemo(() => [...chat].reverse().find(message => message.role === 'user'), [chat])
  const greetings = nickname ? `${nickname}，今天有什么想和我说的吗？不想聊也没关系。` : '今天有什么想和我说的吗？不想聊也没关系。'

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [chat])

  const send = async (text = draft, wantAdvice = false) => {
    const content = text.trim()
    if (!content || sending) return
    setSaveError('')
    const userId = wantAdvice ? [...chat].reverse().find(message => message.role === 'user')?.id : crypto.randomUUID()
    if (!wantAdvice) {
      setChat(items => [...items, { id: userId, role: 'user', text: content, emotionLabel: null }])
      setDraft('')
    }
    setSending(true)
    setPetMood('thinking')
    try {
      if (!wantAdvice && sendMode === 'save') {
        if (!saveEnabled) throw new Error('save-disabled')
        await request('/diaries', json('POST', { kind: 'chat', text: content, mode: 'save', allow_retrieval: true }))
        setSavedIds(ids => [...ids, userId])
        setChat(items => [...items, { id: crypto.randomUUID(), role: 'notice', text: '已保存这段话，不需要回应。' }])
        setNotice('只保存了你的原话；之后可在日记里编辑或补充。')
        await onDiarySaved()
        return
      }
      const conversation = chat.filter(message => message.role === 'user' || message.role === 'assistant').slice(-6).map(message => ({ role: message.role, content: message.text }))
      const response = await request('/companion/respond', json('POST', { text: content, want_advice: wantAdvice, response_preference: responsePreference, conversation }))
      setChat(items => [...items, { id: crypto.randomUUID(), userId, role: 'assistant', text: response.reply, suggestion: response.suggestion, memories: response.memories || [], emotionSuggestion: response.emotion_suggestion, safety: response.safety, memoryEnabled: response.memory_enabled }])
    } catch {
      setSaveError(sendMode === 'save' ? '这段内容没有保存成功，原文还在，可以重试。' : '回应暂时没有送达。你的原文还在，可以重试。')
    } finally {
      setSending(false)
      setPetMood('idle')
    }
  }

  const setTurnEmotion = (turnId, label) => setChat(items => items.map(item => item.id === turnId ? { ...item, emotionLabel: label } : item))
  const saveTurn = async turn => {
    if (!saveEnabled) { setSaveError('新记录保存已关闭。可以到设置中开启，或继续只在本次聊天中保留。'); return }
    try {
      const userTurn = chat.find(item => item.id === turn.userId)
      if (!userTurn) return
      const saved = await request('/diaries', json('POST', { kind: 'chat', text: userTurn.text, mode: 'save', emotion_label: userTurn.emotionLabel || undefined }))
      setSavedIds(ids => [...ids, userTurn.id])
      setNotice('只保存了你的原话；之后可在日记里编辑或补充。')
      await onDiarySaved()
      return saved
    } catch {
      setSaveError('这段内容没有保存成功，原文还留在聊天里。请检查设置后重试。')
    }
  }

  return <div className="companion-view">
    <div className="welcome-strip"><div><p className="eyebrow">和 {pet.name} 在一起</p><h1>{greetings}</h1><p>你可以直接说，不必先把感受整理好。</p></div><div className="welcome-actions"><div className="welcome-signal"><span className="signal-dot" />{chat.length ? '我在听' : '今天不必急着解决什么'}</div><button className="secondary-button" onClick={() => composerInput.current?.focus()}>聊聊</button></div></div>
    <div className="companion-grid">
      <section className="conversation-panel" aria-label="陪伴对话">
        <div className="conversation-scroll" aria-live="polite">
          {!chat.length && <div className="conversation-empty"><PetAvatar pet={pet} mood="idle" large /><p>{pet.intro}</p><span>从一件小事开始也可以。</span></div>}
          {chat.map((message, index) => message.role === 'notice' ? <div className="save-only-confirmation" role="status" key={message.id}>{message.text}</div> : message.role === 'user' ? <article className="chat-turn user-turn" key={message.id}>
            <div className="message user-message">{message.text}</div>
            {message.emotionLabel && <span className="confirmed-mini-tag">你标记为 {message.emotionLabel}</span>}
            {savedIds.includes(message.id) && <span className="saved-mini-tag">已保存到日记</span>}
          </article> : <article className="chat-turn agent-turn" key={message.id} data-testid="assistant-reply">
            <div className="agent-avatar"><PetAvatar pet={pet} mood={message.safety ? 'comforting' : 'idle'} /></div>
            <div className="agent-content"><div className="agent-name">{pet.name}<span>陪伴中</span></div><div className="message agent-message">{message.text}</div>
              {message.memories?.length > 0 && <div className="memory-citations"><span className="evidence-kicker">找到的历史记录</span>{message.memories.map(memory => <blockquote key={memory.id}><p>日记原文：“{memory.text}”</p>{memory.response_text && <p className="memory-agent-response">心栖当时回应：“{memory.response_text}”</p>}<cite>{dateLabel(memory.recorded_at)}</cite></blockquote>)}</div>}
              {message.emotionSuggestion && !message.safety && <EmotionPrompt suggestion={message.emotionSuggestion} turn={chat.find(item => item.id === message.userId) || lastUserTurn} onConfirm={label => { const linked = chat.find(item => item.id === message.userId) || lastUserTurn; if (linked) setTurnEmotion(linked.id, label) }} editing={editEmotionFor === message.id} onEdit={() => setEditEmotionFor(editEmotionFor === message.id ? null : message.id)} />}
              {message.suggestion && <AdviceCard advice={message.suggestion} onFeedback={async (action, experience) => {
                await request('/feedback', json('POST', { recommendation_id: message.suggestion.id, action, experience }))
                setNotice(action === 'reject' ? '已记下这次选择，不会把它当成长期偏好。' : action === 'modify' ? '已按你的反馈调整这次建议。' : '已记下你愿意尝试。')
              }} />}
              {index === chat.length - 1 && !message.safety && !message.suggestion && <div className="turn-actions"><button className="inline-action" onClick={() => send(chat.find(item => item.id === message.userId)?.text || '', true)} disabled={!message.userId || sending}>给我一个小建议</button>{message.userId && !savedIds.includes(message.userId) && <button className="inline-action secondary-action" disabled={!saveEnabled} onClick={() => saveTurn(message)}>保存我的原话</button>}</div>}
              {message.suggestion && index === chat.length - 1 && message.userId && !savedIds.includes(message.userId) && <button className="inline-action secondary-action" disabled={!saveEnabled} onClick={() => saveTurn(message)}>保存我的原话</button>}
            </div>
          </article>)}
          {sending && <div className="typing-state"><span /><span /><span />{pet.name}在想怎么回应</div>}
          <div ref={messagesEnd} />
        </div>
        {saveError && <p className="inline-error" role="alert">{saveError}</p>}
        {!saveEnabled && <p className="save-disabled-note">新记录保存已关闭。当前聊天不会自动保存。</p>}
        <form className="composer" onSubmit={event => { event.preventDefault(); send() }}>
          <label className="sr-only" htmlFor="chat-message">和沐沐说说今天</label>
          <textarea ref={composerInput} id="chat-message" placeholder="今天有什么想和我说的？" value={draft} onChange={event => { setDraft(event.target.value); setPetMood(event.target.value ? 'listening' : 'idle') }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} rows={2} />
          <div className="composer-footer"><div className="send-mode" role="radiogroup" aria-label="发送方式"><label><input type="radio" name="send-mode" value="respond" checked={sendMode === 'respond'} onChange={() => setSendMode('respond')} />需要回应</label><label><input type="radio" name="send-mode" value="save" checked={sendMode === 'save'} disabled={!saveEnabled} onChange={() => setSendMode('save')} />仅保存</label></div><span>按 Enter 发送 · Shift + Enter 换行</span><button className="primary-button" type="submit" disabled={!draft.trim() || sending}>发送</button></div>
        </form>
      </section>
      <aside className="companion-aside">
        <section className="aside-section diary-shortcut"><span className="eyebrow">心情日记</span><h2>想慢慢写，也可以。</h2><p>日记由你决定保存什么；聊天不会自动变成日记。</p><button className="secondary-button" onClick={onOpenDiaries}>打开我的日记</button></section>
        <section className="aside-section recent-notes"><div className="aside-heading"><span className="eyebrow">最近记录</span><button className="text-link" onClick={onOpenDiaries}>全部</button></div>{diaries.slice(0, 2).map(diary => <button className="recent-note" key={diary.id} onClick={onOpenDiaries}><span>{dateLabel(diary.recorded_at)}</span><strong>{diary.text}</strong><small>{diary.emotion_confirmed ? diary.emotion.label : '情绪待确认'}</small></button>)}{!diaries.length && <p className="quiet-empty">这里会显示你选择保存的日记。</p>}</section>
        <p className="privacy-note">{memoryEnabled ? '你已允许心栖在聊天中查找旧日记。' : '记忆调用关闭中，心栖不会引用旧日记。'}</p>
      </aside>
    </div>
  </div>
}

function EmotionPrompt({ suggestion, turn, onConfirm, editing, onEdit }) {
  const [selected, setSelected] = useState(suggestion.label)
  const [skipped, setSkipped] = useState(false)
  useEffect(() => setSelected(suggestion.label), [suggestion.label])
  if (turn?.emotionLabel) return <div className="emotion-confirmed">已标记为“{turn.emotionLabel}”<button className="text-link" onClick={onEdit}>修改</button></div>
  if (skipped) return <div className="emotion-skipped">情绪标记已跳过<button className="text-link" onClick={() => setSkipped(false)}>重新选择</button></div>
  return <div className="emotion-prompt"><p>我听起来觉得你可能有些{suggestion.label}，你觉得呢？</p><div className="emotion-prompt-actions"><button className="tag-choice" onClick={() => onConfirm(suggestion.label)}>差不多</button><button className="text-link" onClick={onEdit}>换一个</button><button className="text-link" onClick={() => setSkipped(true)}>先跳过</button></div>{editing && <div className="emotion-choices">{EMOTIONS.map(label => <button key={label} className={selected === label ? 'emotion-choice selected' : 'emotion-choice'} onClick={() => { setSelected(label); onConfirm(label); onEdit() }}>{label}</button>)}</div>}</div>
}

function AdviceCard({ advice, onFeedback }) {
  const [showEvidence, setShowEvidence] = useState(false)
  const [step, setStep] = useState(advice.step)
  const [feedback, setFeedback] = useState('')
  const choose = async (action, experience, confirmation, nextStep) => {
    try { await onFeedback(action, experience); if (nextStep) setStep(nextStep); setFeedback(confirmation) }
    catch { setFeedback('这次选择没有保存成功，请稍后重试。') }
  }
  return <section className="advice-card" data-testid="advice-card"><div className="advice-label"><span className="advice-mark">一步</span><span>一个可选的小办法</span></div><h3>{advice.title}</h3><p>{step}</p><div className="advice-actions"><button className="tag-choice" onClick={() => choose('accept', '愿意尝试', '已记下你愿意尝试。')}>试一下</button><button className="text-link" onClick={() => choose('modify', '改成更轻松的版本', '已把这一步缩小。', '如果愿意，只留意一下脚踩地面的感觉就好；不需要做其他事。')}>换个更轻松的</button><button className="text-link" onClick={() => choose('reject', '这次不想尝试', '这次先不做，没关系。')}>先不用</button></div>{feedback && <p className="advice-feedback" role="status">{feedback}</p>}<button className="evidence-toggle" aria-expanded={showEvidence} onClick={() => setShowEvidence(value => !value)}>{showEvidence ? '收起依据与适用范围' : '依据与适用范围'}</button>{showEvidence && <div className="evidence-detail"><p>{advice.limitation}</p><a href={advice.source.url} target="_blank" rel="noreferrer">{advice.source.title} · {advice.source.publisher} · {advice.source.year}</a></div>}</section>
}

function DiaryPage({ diaries, saveEnabled, responsePreference, onRefresh }) {
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [emotion, setEmotion] = useState('')
  const [journalMode, setJournalMode] = useState('save')
  const [pendingResponse, setPendingResponse] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [supplement, setSupplement] = useState('')
  const [localError, setLocalError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const selected = diaries.find(item => item.id === selectedId)
  const filtered = diaries.filter(item => !query || item.text.includes(query) || item.addenda?.some(note => note.text.includes(query)))

  const saveDiary = async ({ mode = 'save', responseRequested = false, responseText = null } = {}) => {
    const item = await request('/diaries', json('POST', { kind: 'diary', text: draft.trim(), mode, response_requested: responseRequested, response_text: responseText, allow_retrieval: true }))
    if (emotion) await request(`/diaries/${item.id}/emotion`, json('PATCH', { label: emotion, status: 'confirmed' }))
    setDraft(''); setEmotion(''); setPendingResponse(null); setJournalMode('save'); await onRefresh(); setSelectedId(item.id)
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
    if (!draft.trim()) return
    setSaving(true); setLocalError('')
    try { await request(`/diaries/${selected.id}`, json('PATCH', { text: draft.trim() })); setEditing(false); await onRefresh() }
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
    <header className="page-heading"><p className="eyebrow">留给自己的空间</p><h1>心情日记</h1><p>写下当时的自己，也可以在以后回来补充。</p></header>
    {!saveEnabled && <div className="inline-alert">新记录保存已关闭。你仍然可以查看和编辑已有日记。</div>}
    <div className="diary-layout">
      <section className="diary-list-pane"><div className="list-heading"><h2>所有记录 <small>{diaries.length}</small></h2><input aria-label="搜索日记" placeholder="搜索日记" value={query} onChange={event => setQuery(event.target.value)} /></div>
        <form className="journal-composer" onSubmit={create}><label htmlFor="journal-draft">写一篇新的日记</label><textarea id="journal-draft" placeholder="把想留下来的部分写在这里。可以是一件事、一种感觉，也可以只写一句。" value={draft} onChange={event => setDraft(event.target.value)} disabled={!saveEnabled} />
          <div className="journal-prompts"><span>可以从这里开始</span>{['今天发生了什么？', '此刻最明显的感受是什么？', '有什么想留给以后的自己？'].map(prompt => <button type="button" key={prompt} onClick={() => setDraft(text => `${text}${text ? '\n' : ''}${prompt}\n`)}>{prompt}</button>)}</div>
          <div className="journal-emotions"><span>情绪标记（可跳过）</span>{EMOTIONS.slice(0, 6).map(label => <button type="button" key={label} className={emotion === label ? 'emotion-choice selected' : 'emotion-choice'} aria-pressed={emotion === label} onClick={() => setEmotion(emotion === label ? '' : label)}>{label}</button>)}</div>
          <div className="journal-mode" role="radiogroup" aria-label="日记保存方式"><span>写完之后</span><label><input type="radio" name="journal-mode" value="save" checked={journalMode === 'save'} onChange={() => { setJournalMode('save'); setPendingResponse(null) }} />仅保存</label><label><input type="radio" name="journal-mode" value="respond" checked={journalMode === 'respond'} onChange={() => setJournalMode('respond')} />需要回应</label></div>
          {pendingResponse && <section className="diary-response-preview" data-testid="diary-response-preview"><p className="eyebrow">心栖的回应</p><p>{pendingResponse.response}</p><div><button type="submit" className="primary-button" disabled={saving}>保存这篇日记</button><button type="button" className="text-link" onClick={keepOriginalOnly} disabled={saving}>只保存原文</button><button type="button" className="text-link" onClick={() => setPendingResponse(null)} disabled={saving}>重新编辑</button></div></section>}
          {localError && <p className="inline-error" role="alert">{localError}</p>}{!pendingResponse && <button className="primary-button" type="submit" disabled={!draft.trim() || !saveEnabled || saving}>{saving ? '处理中…' : journalMode === 'respond' ? '先听听心栖回应' : '保存日记'}</button>}
        </form>
        <div className="diary-list">{filtered.map(item => <button aria-label="打开日记" className={item.id === selectedId ? 'diary-row selected' : 'diary-row'} key={item.id} onClick={() => { setSelectedId(item.id); setDraft(item.text); setEditing(false); setLocalError('') }}><span className="diary-date">{dateLabel(item.recorded_at)}</span><strong>{item.text}</strong><span className="diary-meta"><i className={`mood-dot mood-${EMOTIONS.indexOf(item.emotion?.label)}`} />{item.emotion_confirmed ? item.emotion.label : '情绪待确认'} · {item.kind === 'chat' ? '来自聊天' : '独立日记'}</span></button>)}
          {!filtered.length && <div className="empty-copy"><strong>{query ? '没有找到相关日记。' : '这里还没有记录。'}</strong><span>{query ? '换个关键词试试。' : '想写的时候再来就好。'}</span></div>}
        </div>
      </section>
      <section className="diary-detail-pane" aria-live="polite">
        {!selected ? <div className="detail-empty"><span className="detail-icon">✦</span><h2>选择一篇日记</h2><p>原文和后来补充会分开展示，方便你回来看。</p></div> : <>
          <div className="detail-toolbar"><span>{dateLabel(selected.recorded_at)}{selected.updated_at && ` · 更新于 ${dateLabel(selected.updated_at)}`}</span><div><button className="text-link" onClick={() => { setEditing(value => !value); setDraft(selected.text) }}>{editing ? '取消编辑' : '编辑记录'}</button><button className="text-link danger-link" onClick={() => setDeleteConfirm(true)}>删除</button></div></div>
          <div className="entry-section"><p className="eyebrow">当时写下</p>{editing ? <><label className="sr-only" htmlFor="diary-original">日记原文</label><textarea id="diary-original" aria-label="日记原文" className="edit-diary-text" value={draft} onChange={event => setDraft(event.target.value)} /><button className="primary-button" onClick={saveEdit} disabled={saving}>保存修改</button>{localError && <p className="inline-error" role="alert">{localError}</p>}</> : <p className="entry-original">{selected.text}</p>}</div>
          {selected.response_text && <div className="entry-section diary-response-entry"><p className="eyebrow">心栖回应</p><p className="entry-original">{selected.response_text}</p></div>}
          <div className="entry-section emotion-entry"><p className="eyebrow">情绪标记</p>{selected.emotion_confirmed ? <div className="confirmed-emotion">{selected.emotion.label}<button className="text-link" onClick={() => setEmotion(selected.emotion.label)}>修改</button></div> : <p className="unconfirmed-label">系统初步理解为“{selected.emotion?.label || '未识别'}”，仅供参考，可确认、修改或跳过。</p>}
            <div className="emotion-choices">{EMOTIONS.map(label => <button key={label} className={selected.emotion_confirmed && selected.emotion.label === label ? 'emotion-choice selected' : 'emotion-choice'} onClick={() => confirmEmotion(label)}>{label}</button>)}<button className="text-link" onClick={async () => { await request(`/diaries/${selected.id}/emotion`, json('PATCH', { status: 'skipped' })); await onRefresh() }}>跳过</button></div>
          </div>
          <div className="entry-section later-notes"><p className="eyebrow">后来补充</p>{(selected.addenda || []).map(note => <article className="addendum" key={note.id}><p>{note.text}</p><time>{dateLabel(note.recorded_at)}</time></article>)}<form onSubmit={addSupplement}><label className="sr-only" htmlFor="diary-supplement">后来想补充什么？</label><textarea id="diary-supplement" aria-label="后来想补充什么？" placeholder="后来想补充什么？" value={supplement} onChange={event => setSupplement(event.target.value)} /><button className="secondary-button" disabled={!supplement.trim()}>添加补充</button></form></div>
          {deleteConfirm && <div className="confirm-delete" role="alertdialog" aria-modal="true"><strong>删除这篇日记？</strong><p>删除后，这段内容也不会再出现在心栖的记忆检索中。</p><button className="text-link" onClick={() => setDeleteConfirm(false)}>保留</button><button className="danger-button" onClick={removeDiary}>确认删除</button></div>}
        </>}
      </section>
    </div>
  </div>
}

function ReviewPage({ metrics, diaries, onOpenDiary }) {
  const entries = Object.entries(metrics.counts || {}).sort((left, right) => right[1] - left[1])
  const max = Math.max(1, ...entries.map(([, value]) => value))
  const canDraw = metrics.total_confirmed >= 3
  return <div className="review-view"><header className="page-heading"><p className="eyebrow">只展示你选择记录的日子</p><h1>最近的心情</h1><p>这里只回顾最近 7 天确认过的情绪标签，不代表这段时间的全部状态。</p></header>
    <section className="review-summary"><div><span className="eyebrow">已确认记录</span><strong>{metrics.total_confirmed || 0}</strong><small>条 · 最近 7 天</small></div><div><span className="eyebrow">全部日记</span><strong>{diaries.length}</strong><small>条记录</small></div></section>
    {canDraw ? <section className="mood-chart" aria-label="最近心情记录统计">{entries.map(([label, count]) => <button className="mood-bar-row" key={label} onClick={onOpenDiary}><span>{label}</span><span className="mood-bar-track"><i className={`mood-bar fill-${EMOTIONS.indexOf(label)}`} style={{ width: `${Math.max(12, count / max * 100)}%` }} /></span><strong>{count}</strong></button>)}</section> : <section className="review-empty"><h2>{metrics.total_confirmed ? '目前记录还不多' : '还没有确认过的情绪记录'}</h2><p>多记录几次之后，再回来看看会更有参考价值。没有记录的日子不会被当作平静。</p></section>}
    <div className="review-footnote">记录可能没有覆盖每一天，也不代表完整的你。情绪统计只用于自我回看，不是心理评估。</div>
    <section className="review-recent"><div className="aside-heading"><span className="eyebrow">最近确认的记录</span><button className="text-link" onClick={onOpenDiary}>查看日记</button></div>{metrics.timeline.slice(-5).reverse().map(row => <button className="timeline-row" key={row.diary_id} onClick={onOpenDiary}><span>{dateLabel(row.date)}</span><strong>{row.label}</strong><span>打开对应日记 →</span></button>)}</section>
  </div>
}

function MoodCalendar({ onOpenDiary }) {
  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [calendar, setCalendar] = useState({ days: [], days_in_month: 0, first_weekday: 0 })
  const [selectedDate, setSelectedDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const year = cursor.getFullYear()
  const month = cursor.getMonth() + 1
  useEffect(() => {
    setLoading(true)
    request(`/calendar?year=${year}&month=${month}`).then(data => {
      setCalendar(data)
      setSelectedDate(current => data.days.some(day => day.date === current) ? current : (data.days[0]?.date || ''))
    }).catch(() => setError('这个月的心情暂时没有加载出来。')).finally(() => setLoading(false))
  }, [year, month])
  const byDate = useMemo(() => Object.fromEntries(calendar.days.map(day => [day.date, day])), [calendar.days])
  const cells = [...Array(calendar.first_weekday).fill(null), ...Array.from({ length: calendar.days_in_month }, (_, index) => index + 1)]
  while (cells.length % 7) cells.push(null)
  const selected = byDate[selectedDate]
  const shiftMonth = offset => setCursor(new Date(year, month - 1 + offset, 1))
  return <div className="calendar-view"><header className="page-heading"><p className="eyebrow">把情绪放回时间里</p><h1>心情日历</h1><p>点击某一天，回看当时确认过的情绪和日记。没有记录的日子会保持空白。</p></header>
    <div className="calendar-layout"><section className="calendar-panel" aria-label="心情日历"><div className="calendar-toolbar"><button className="quiet-button" aria-label="上个月" onClick={() => shiftMonth(-1)}>‹</button><strong>{year} 年 {month} 月</strong><button className="quiet-button" aria-label="下个月" onClick={() => shiftMonth(1)}>›</button></div><div className="calendar-weekdays">{['一', '二', '三', '四', '五', '六', '日'].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((day, index) => { const dateKey = day ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : ''; const entry = byDate[dateKey]; return <button key={`${dateKey || 'empty'}-${index}`} className={`calendar-cell ${entry ? 'has-mood' : ''} ${selectedDate === dateKey ? 'selected' : ''}`} disabled={!day} onClick={() => setSelectedDate(dateKey)}>{day && <><span className="calendar-number">{day}</span><span className="calendar-moods">{(entry?.emotions || []).slice(0, 3).map(label => <i key={label} className={`mood-dot mood-${EMOTIONS.indexOf(label)}`} title={label} />)}</span></>}</button> })}</div><div className="calendar-legend"><span><i className="mood-dot mood-0" />开心</span><span><i className="mood-dot mood-2" />疲惫</span><span><i className="mood-dot mood-4" />低落</span><span><i className="mood-dot mood-6" />焦虑</span></div></section><section className="calendar-detail" aria-live="polite">{loading ? <div className="detail-empty"><span className="detail-icon">✦</span><h2>正在打开这段时间</h2></div> : error ? <div className="detail-empty"><h2>{error}</h2></div> : selected ? <><div className="calendar-detail-heading"><p className="eyebrow">{dateLabel(selected.date)}</p><h2>这一天的心情</h2><div className="calendar-emotions">{selected.emotions.map(label => <span key={label} className={`emotion-pill mood-pill-${EMOTIONS.indexOf(label)}`}>{label}</span>)}</div></div><div className="calendar-diary-list">{selected.diaries.map(diary => <article className="calendar-diary" key={diary.id}><p>{diary.text}</p>{diary.response_text && <div className="calendar-response"><span className="eyebrow">心栖回应</span><p>{diary.response_text}</p></div>}<small>{diary.kind === 'chat' ? '来自聊天' : '独立日记'}</small></article>)}</div><button className="secondary-button" onClick={onOpenDiary}>打开日记详情</button></> : <div className="detail-empty"><span className="detail-icon">○</span><h2>这一天还没有记录</h2><p>如果你愿意，可以从今天开始留下一点心情。</p><button className="secondary-button" onClick={onOpenDiary}>写一篇日记</button></div>}</section></div>
  </div>
}

function SettingsPage({ settings, profiles, pet, onUpdate, onChoosePet, onRefresh }) {
  const [profileText, setProfileText] = useState('')
  const [profileType, setProfileType] = useState('喜欢')
  const [error, setError] = useState('')
  const addProfile = async event => {
    event.preventDefault()
    if (!profileText.trim()) return
    try { await request('/profile', json('POST', { content: profileText.trim(), type: profileType, confirmed: true, status: 'active' })); setProfileText(''); await onRefresh() }
    catch { setError('偏好没有保存，请重试。') }
  }
  const removeProfile = async id => { try { await request(`/profile/${id}`, { method: 'DELETE' }); await onRefresh() } catch { setError('偏好没有删除，请重试。') } }
  const toggle = key => onUpdate({ [key]: !settings[key] }).catch(() => setError('设置没有更新，请重试。'))
  return <div className="settings-view"><header className="page-heading"><p className="eyebrow">由你决定</p><h1>陪伴设置</h1><p>角色、保存和记忆调用都可以随时调整。</p></header>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <section className="settings-section pet-setting"><div><p className="eyebrow">我的伙伴</p><h2>{pet.name} · {pet.kind}</h2><p>{pet.intro}</p></div><PetAvatar pet={pet} mood="idle" /><button className="secondary-button" onClick={onChoosePet}>更换伙伴</button></section>
    <section className="settings-section"><p className="eyebrow">隐私与记录</p>
      <SettingSwitch label="保存我之后写下的内容" description="关闭后，新的聊天和日记不会写入历史。已有记录仍可查看。" checked={settings.save_enabled} onToggle={() => toggle('save_enabled')} />
      <SettingSwitch label="允许心栖在聊天时查找旧日记" description="只在聊天中检索你保存且允许调用的记录。关闭后，日记仍可由你自己查看。" checked={settings.memory_enabled} onToggle={() => toggle('memory_enabled')} />
    </section>
    <section className="settings-section"><p className="eyebrow">陪伴习惯</p><label className="form-label" htmlFor="settings-nickname">我该怎么称呼你？</label><div className="settings-inline"><input id="settings-nickname" className="text-input" maxLength={40} defaultValue={settings.nickname} onBlur={event => { if (event.target.value !== settings.nickname) onUpdate({ nickname: event.target.value }).catch(() => setError('称呼没有保存，请重试。')) }} /></div><fieldset className="response-preference"><legend className="form-label">我更喜欢这样的回应</legend><div className="preference-options">{[['listen_first', '先听我说'], ['think_together', '一起想办法'], ['adapt', '看当下情况']].map(([value, label]) => <button type="button" key={value} className={settings.response_preference === value ? 'preference-option selected' : 'preference-option'} aria-pressed={settings.response_preference === value} onClick={() => onUpdate({ response_preference: value }).catch(() => setError('偏好没有更新，请重试。'))}>{label}</button>)}</div></fieldset></section>
    <section className="settings-section profile-settings"><div className="aside-heading"><div><p className="eyebrow">确认过的偏好</p><h2>只记住你确认过的事</h2></div><span>{profiles.length} 条</span></div>{profiles.map(profile => <article className="profile-setting-row" key={profile.id}><div><strong>{profile.content}</strong><span>{profile.type} · {profile.confirmed ? '已确认' : '待确认'}</span><small>{profile.source_id ? `来自日记 ${profile.source_id}` : '手动添加'}</small></div><button className="text-link danger-link" onClick={() => removeProfile(profile.id)}>删除</button></article>)}
      <form className="profile-add-form" onSubmit={addProfile}><input className="text-input" placeholder="例如：喜欢安静的散步" value={profileText} onChange={event => setProfileText(event.target.value)} /><select className="select-input" value={profileType} onChange={event => setProfileType(event.target.value)}><option>喜欢</option><option>反感</option><option>想尝试</option><option>已体验</option></select><button className="secondary-button" disabled={!profileText.trim()}>添加偏好</button></form>
    </section>
    <p className="settings-footnote">聊天默认不会自动变成日记。你可以分别关闭保存与记忆调用。</p>
  </div>
}

function SettingSwitch({ label, description, checked, onToggle }) {
  return <div className="setting-row"><span><strong>{label}</strong><small>{description}</small></span><button type="button" role="switch" aria-label={label} aria-checked={checked} className={checked ? 'switch on' : 'switch'} onClick={onToggle}><i /></button></div>
}

function PetPicker({ currentPet, onChoose, onClose }) {
  return <div className="onboarding-backdrop"><section className="onboarding-panel pet-picker-panel" role="dialog" aria-modal="true" aria-labelledby="pet-picker-title"><button className="modal-close" aria-label="关闭选择" onClick={onClose}>×</button><p className="eyebrow">陪伴伙伴</p><h1 id="pet-picker-title">想换一位伙伴吗？</h1><div className="pet-selection-grid">{PETS.map(pet => <button key={pet.id} className={pet.id === currentPet.id ? 'pet-selection selected' : 'pet-selection'} onClick={() => onChoose(pet.id)}><PetAvatar pet={pet} mood="idle" large /><span className="pet-name">{pet.name}<small>{pet.kind}</small></span><span className="pet-intro">“{pet.intro}”</span><span className="choose-pet">选择 {pet.name}</span></button>)}</div></section></div>
}

function PetAvatar({ pet, mood = 'idle', large = false }) {
  return <SpritePet pet={pet} mood={mood} label={`${pet.name}陪伴中`} large={large} />
}

function SpritePet({ pet, mood, label, large }) {
  const assetPet = pet.id === 'otter' ? 'mumu' : pet.id
  const state = mood === 'listening' ? 'listening' : mood === 'thinking' ? 'thinking' : mood === 'comforting' ? 'comforting' : mood === 'encouraging' ? 'encouraging' : mood === 'resting' ? 'resting' : 'idle'
  return <span className={`sprite-pet ${large ? 'large' : ''}`} role="img" aria-label={label} data-testid={`${pet.id === 'otter' ? 'mumu' : pet.id}-sprite`}><img src={`/pets/${assetPet}/${state}.gif?v=20261101-gif3`} alt="" /></span>
}

function PetDock({ pet, mood, page, position, onMove, onOpen, onChange }) {
  const ref = useRef(null)
  const drag = useRef(null)
  const suppressClick = useRef(false)
  const [moving, setMoving] = useState(false)
  const style = position && page === '陪伴' ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined
  useEffect(() => {
    const clamp = () => { const rect = ref.current?.getBoundingClientRect(); if (!rect || !position) return; const next = { x: Math.max(0, Math.min(innerWidth - rect.width, position.x)), y: Math.max(0, Math.min(innerHeight - rect.height, position.y)) }; if (next.x !== position.x || next.y !== position.y) storePosition(next) }
    const storePosition = next => { onMove(next); localStorage.setItem('heart-pet-position', JSON.stringify(next)) }
    window.addEventListener('resize', clamp); clamp(); return () => window.removeEventListener('resize', clamp)
  }, [position, onMove])
  const begin = event => { if (page !== '陪伴' || event.target.closest('button')) return; if (event.button !== undefined && event.button !== 0) return; const rect = ref.current.getBoundingClientRect(); drag.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false }; ref.current.setPointerCapture?.(event.pointerId) }
  const move = event => { if (!drag.current) return; const dx = event.clientX - drag.current.x; const dy = event.clientY - drag.current.y; if (Math.abs(dx) + Math.abs(dy) > 5) drag.current.moved = true; if (!drag.current.moved) return; const rect = ref.current.getBoundingClientRect(); const next = { x: Math.max(0, Math.min(innerWidth - rect.width, drag.current.left + dx)), y: Math.max(0, Math.min(innerHeight - rect.height, drag.current.top + dy)) }; onMove(next); localStorage.setItem('heart-pet-position', JSON.stringify(next)); setMoving(true); event.preventDefault() }
  const end = () => { if (drag.current?.moved) suppressClick.current = true; drag.current = null; setMoving(false) }
  const tap = event => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); return } onOpen() }
  const bubble = mood === 'listening' ? '我在听。' : mood === 'thinking' ? '让我想一想。' : '想说话时，点我就好。'
  const pageClass = page === '陪伴' ? 'companion-page-dock' : page === '日记' ? 'diary-page-dock' : 'utility-page-dock'
  return <aside ref={ref} className={`pet-dock ${pageClass} ${moving ? 'moving' : ''}`} style={style} data-testid="pet-dock" onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
    <div className="pet-bubble">{bubble}</div><button className="pet-dock-avatar" aria-label={`和${pet.name}聊聊`} onClick={tap}><PetAvatar pet={pet} mood={mood} /></button>
    <div className="pet-dock-actions"><button onClick={onOpen}>和{pet.name}聊聊</button><button aria-label="更换陪伴伙伴" onClick={onChange}>更换</button></div>
  </aside>
}

createRoot(document.getElementById('root')).render(<ProductApp />)

