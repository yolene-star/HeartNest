import React, { useEffect, useRef, useState } from 'react'
import './quiet-scene.css'

// Quiet water-like ambience, generated locally. No network request or microphone.
function createAmbience() {
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) throw new Error('audio-unavailable')
  const context = new AudioContext()
  const buffer = context.createBuffer(1, context.sampleRate * 8, context.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i++) {
    last = (last + (Math.random() * 2 - 1) * 0.025) / 1.025
    data[i] = last * 3
  }
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const gain = context.createGain()
  source.buffer = buffer; source.loop = true
  filter.type = 'lowpass'; filter.frequency.value = 1100
  gain.gain.value = 0
  source.connect(filter); filter.connect(gain); gain.connect(context.destination)
  source.start()
  return { context, source, gain }
}

function Icon({ name }) {
  const paths = {
    back: 'M19 12H5m6-6-6 6 6 6',
    place: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    sound: 'M4 9h4l5-4v14l-5-4H4ZM17 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14',
    mute: 'M4 9h4l5-4v14l-5-4H4Zm13 0 5 6m0-6-5 6',
    chat: 'M21 11a9 9 0 0 1-9 9H6l-4 2 2-6A9 9 0 1 1 21 11ZM8 11h.01M12 11h.01M16 11h.01',
    motion: 'M4 7c5-6 10 6 16 0M4 12c5-6 10 6 16 0M4 17c5-6 10 6 16 0',
    close: 'm6 6 12 12M6 18 18 6',
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>
}

export default function QuietScene({ pet, mood, renderPet, chatOpen, onChatChange, onExit }) {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [soundOn, setSoundOn] = useState(false)
  const [volume, setVolume] = useState(25)
  const [soundError, setSoundError] = useState('')
  const [placesOpen, setPlacesOpen] = useState(false)
  const [petMessage, setPetMessage] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const audio = useRef(null)
  const audioVersion = useRef(0)
  const timer = useRef(null)
  const petTimer = useRef(null)
  const pickerButton = useRef(null)
  const sceneRef = useRef(null)
  const exitButton = useRef(null)

  const stopAudio = () => {
    audioVersion.current++
    if (audio.current) {
      audio.current.source.stop()
      audio.current.context.close().catch(() => {})
      audio.current = null
    }
  }
  const reveal = () => {
    setControlsVisible(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (!sceneRef.current?.contains(document.activeElement)) setControlsVisible(false)
    }, 6500)
  }
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    exitButton.current?.focus({ preventScroll: true })
    reveal()
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = event => setReduced(event.matches)
    media.addEventListener('change', update)
    const visibility = () => { if (document.hidden) { stopAudio(); setSoundOn(false) } }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      document.body.style.overflow = originalOverflow
      media.removeEventListener('change', update)
      document.removeEventListener('visibilitychange', visibility)
      clearTimeout(timer.current); clearTimeout(petTimer.current); stopAudio()
    }
  }, [])
  useEffect(() => {
    const escape = event => {
      if (event.key !== 'Escape') return
      if (placesOpen) { setPlacesOpen(false); pickerButton.current?.focus() }
      else if (chatOpen) onChatChange(false)
      else onExit()
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [chatOpen, placesOpen, onChatChange, onExit])
  const toggleSound = async () => {
    if (soundOn) { stopAudio(); setSoundOn(false); return }
    setSoundError('')
    try {
      if (!audio.current) audio.current = createAmbience()
      const current = audio.current, version = audioVersion.current
      await current.context.resume()
      if (version !== audioVersion.current) return
      current.gain.gain.setTargetAtTime(volume / 100 * 0.5, current.context.currentTime, 0.4)
      setSoundOn(true)
      } catch { stopAudio(); setSoundOn(false); setSoundError('声音暂时无法播放，可以先安静待着。'); }
  }
  const changeVolume = event => {
    const next = Number(event.target.value); setVolume(next)
    if (audio.current) audio.current.gain.gain.setTargetAtTime(next / 100 * 0.5, audio.current.context.currentTime, 0.2)
  }
  const petTap = () => {
    setPetMessage(true); clearTimeout(petTimer.current)
    petTimer.current = setTimeout(() => setPetMessage(false), 3500)
  }
  return <section ref={sceneRef} className={`quiet-scene ${reduced ? 'reduced-motion' : ''} ${chatOpen ? 'with-chat' : ''} ${controlsVisible || placesOpen ? '' : 'controls-resting'}`} data-testid="quiet-scene" aria-label="湖边安静陪伴" onPointerMove={reveal} onPointerDown={reveal} onFocusCapture={reveal}>
    <img className="quiet-background" src="/scenes/lakeside-watercolor.png" alt="水彩远山、平静的湖面与柔软草坡" />
    <div className="quiet-ripples" aria-hidden="true"><i /><i /><i /></div>
    <header className="quiet-header">
      <button ref={exitButton} className="quiet-return" onClick={onExit}><Icon name="back" />返回陪伴</button>
      <div><button className="quiet-motion" aria-pressed={reduced} onClick={() => setReduced(value => !value)}><Icon name="motion" />{reduced ? '开启动态' : '减少动态'}</button><span className="quiet-brand">心栖</span></div>
    </header>
    <div className="quiet-title"><h1>湖边发呆</h1><p>我们在这里待会儿。</p></div>
    <button className="quiet-pet" aria-label={`陪${pet.name}坐一会儿`} onClick={petTap}>
      {reduced ? <img src={`/pets/${pet.id === 'otter' ? 'mumu' : pet.id}/idle-0.png`} alt={`${pet.name}安静坐着`} /> : renderPet(mood === 'thinking' ? 'thinking' : 'idle')}
    </button>
    {petMessage && <p className="quiet-pet-message" role="status">嗯，我在这里。</p>}
    <footer className="quiet-bottom">
      {soundError && <p className="quiet-sound-error" role="alert">{soundError}</p>}
      {soundOn && <label className="quiet-volume">水声<input aria-label="环境声音音量" type="range" min="0" max="100" value={volume} onChange={changeVolume} /></label>}
      <nav className="quiet-toolbar" aria-label="安静陪伴操作">
        <button ref={pickerButton} onClick={() => setPlacesOpen(true)} aria-haspopup="dialog"><Icon name="place" /><span>换个地方</span></button>
        <button aria-label={soundOn ? '关闭环境声音' : '环境声音'} aria-pressed={soundOn} onClick={toggleSound}><Icon name={soundOn ? 'sound' : 'mute'} /><span>{soundOn ? '关闭声音' : '环境声音'}</span></button>
        <button aria-expanded={chatOpen} onClick={() => onChatChange(!chatOpen)}><Icon name="chat" /><span>{chatOpen ? '收起聊天' : '想聊聊'}</span></button>
      </nav>
    </footer>
    {placesOpen && <div className="quiet-place-backdrop" onClick={() => { setPlacesOpen(false); pickerButton.current?.focus() }}>
      <div className="quiet-place-picker" role="dialog" aria-modal="true" aria-labelledby="quiet-place-title" onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Tab') { event.preventDefault(); const buttons = [...event.currentTarget.querySelectorAll('button')]; const index = buttons.indexOf(document.activeElement); buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus() } }}>
        <div><h2 id="quiet-place-title">找个地方待会儿</h2><button autoFocus aria-label="关闭场景选择" onClick={() => { setPlacesOpen(false); pickerButton.current?.focus() }}><Icon name="close" /></button></div>
        <button className="quiet-place-option" aria-label="湖边发呆，当前场景" onClick={() => { setPlacesOpen(false); pickerButton.current?.focus() }}><img src="/scenes/lakeside-watercolor.png" alt="" /><span>湖边发呆<small>当前场景 · 一起看一会儿湖面</small></span><span aria-hidden="true">✓</span></button>
        <p>现在先在湖边坐坐，新的风景会慢慢补充。</p>
      </div>
    </div>}
  </section>
}
