import React, { useEffect, useMemo, useState } from 'react'

export const MOODS = [
  { label: '开心', color: '#f3d36e', path: 'M7 8v2M17 8v2M6 14c3 6 9 6 12 0Z' },
  { label: '平静', color: '#b5ce8b', path: 'M5 9c2 2 3 2 5 0M14 9c2 2 3 2 5 0M9 16c2 1 4 1 6 0' },
  { label: '疲惫', color: '#dfc5ab', path: 'M5 10h5M14 10h5M10 17h4' },
  { label: '低落', color: '#a8c7e1', path: 'm5 8 5 2M14 10l5-2M8 17c2-3 6-3 8 0' },
  { label: '焦虑', color: '#c9bfdf', path: 'm5 7 5 2M14 9l5-2M8 16l2-1 2 1 2-1 2 1' },
  { label: '生气', color: '#e9b6a4', path: 'm5 7 5 3M14 10l5-3M8 17c2-3 6-3 8 0' },
  { label: '混合/说不清', color: '#d2c5de', path: 'M6 8v2M17 8v2M6 16c2-4 4 3 6 0s4-1 6 0' },
  { label: '其他', color: '#d4dacd', path: 'M6 9h2M16 9h2M9 16h6' },
]
export const normalizeEmotion = label => ({ 积极: '开心', 平稳: '平静' }[label] || label)
export const emotionInfo = label => MOODS.find(mood => mood.label === normalizeEmotion(label)) || MOODS[7]
export function MoodFace({ label, small = false }) {
  const mood = emotionInfo(label)
  return <span className={`mood-face ${small ? 'small' : ''}`} style={{ '--mood-color': mood.color }} role="img" aria-label={label}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={mood.path} /></svg></span>
}
export function NatureIcon({ name }) {
  const paths = {
    陪伴: 'M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0ZM7 10h8M7 14h5',
    日记: 'M4 3h14a2 2 0 0 1 2 2v16H6a3 3 0 0 1-3-3V5a2 2 0 0 1 1-2ZM3 17h17M8 3v14M12 8h4M12 11h3',
    回顾: 'M12 21 3 12C-3 4 7-1 12 6 17-1 27 4 21 12Z',
    我的: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2Z',
    leaf: 'M20 3C7 2 2 8 5 15c3 7 16 5 15-12ZM4 21 16 8M10 15l-1-5M14 11l4 1',
  }
  return <svg className="nature-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name] || paths.leaf} /></svg>
}

export function NatureCalendar({ request, onOpenDiary, onWrite, state, onStateChange }) {
  const today = new Date()
  const todayKey = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(today)
  const [cursor, setCursor] = useState(() => state ? new Date(state.year, state.month - 1, 1) : new Date(today.getFullYear(), today.getMonth(), 1))
  const [calendar, setCalendar] = useState({ days: [], days_in_month: 0, first_weekday: 0 })
  const [selectedDate, setSelectedDate] = useState(state?.selectedDate || '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const year = cursor.getFullYear(), month = cursor.getMonth() + 1
  useEffect(() => { onStateChange?.({ year, month, selectedDate }) }, [year, month, selectedDate, onStateChange])
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    request(`/calendar?year=${year}&month=${month}`).then(data => {
      if (!active) return
      setCalendar(data)
      setSelectedDate(current => data.days.some(day => day.date === current && day.date <= todayKey) ? current : data.days.filter(day => day.date <= todayKey).at(-1)?.date || '')
    }).catch(() => { if (active) setError('这个月的心情暂时没有加载出来。') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [year, month, retry, request])
  const byDate = useMemo(() => Object.fromEntries(calendar.days.map(day => [day.date, day])), [calendar.days])
  const selected = byDate[selectedDate]
  const cells = [...Array(calendar.first_weekday).fill(null), ...Array.from({ length: calendar.days_in_month }, (_, index) => index + 1)]
  const shift = offset => { setCalendar({ days: [], first_weekday: 0, days_in_month: 0 }); setCursor(new Date(year, month - 1 + offset, 1)) }
  return <div className="calendar-view"><div className="calendar-layout">
    <section className="calendar-panel" aria-label="心情日历" aria-busy={loading}>
      <div className="calendar-toolbar"><strong>{year} 年 {month} 月</strong><div><button className="quiet-button" aria-label="上个月" disabled={year === 2000 && month === 1} onClick={() => shift(-1)}>‹</button><button className="quiet-button" aria-label="下个月" disabled={year === 2100 && month === 12} onClick={() => shift(1)}>›</button></div></div>
      <div className="calendar-weekdays">{['一','二','三','四','五','六','日'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">{cells.map((day, index) => {
        const key = day ? `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}` : ''
        const entry = byDate[key]
        return day ? <button key={key} className={`calendar-cell ${entry ? 'has-mood' : ''} ${selectedDate === key ? 'selected' : ''}`} disabled={key > todayKey} title={key > todayKey ? '未来日期暂不能记录日记' : undefined} aria-label={`${key}，${key > todayKey ? '未来日期暂不能记录' : entry ? entry.emotions.join('、') : '无已确认记录'}`} aria-pressed={selectedDate === key} onClick={() => setSelectedDate(key)}>
          {entry ? <span className="calendar-moods">{entry.emotions.slice(0,3).map(label => <MoodFace key={label} label={label} small />)}</span> : <span className="calendar-empty-ring" aria-hidden="true" />}
          <span className="calendar-number">{day}</span>
        </button> : <span key={`empty-${index}`} />
      })}</div>
      <div className="calendar-legend">{MOODS.map(mood => <span key={mood.label}><i style={{ background: mood.color }} />{mood.label === '平静' ? '平稳' : mood.label}</span>)}</div>
      <p className="nature-note">虚线圈表示没有已确认的记录，不代表心情平静。</p>
    </section>
    <section className="calendar-detail" aria-live="polite">{loading ? <div className="detail-empty"><h2>正在打开这段时间…</h2></div> : error ? <div className="detail-empty"><h2>{error}</h2><button className="secondary-button" onClick={() => setRetry(value => value + 1)}>重试</button></div> : selected ? <>
      <p className="eyebrow">{selected.date}</p><h2>这一天的心情</h2><div className="calendar-emotions">{selected.emotions.map(label => <span className="nature-emotion" key={label}><MoodFace label={label}/>{label}</span>)}</div>
      <div className="calendar-diary-list">{selected.diaries.map(diary => <article className="calendar-diary" key={diary.id}><p>{diary.text}</p>{diary.response_text && <div className="calendar-response"><span className="eyebrow">心栖回应</span><p>{diary.response_text}</p></div>}<small>{diary.kind === 'chat' ? '来自聊天' : '独立日记'}</small><button className="secondary-button" onClick={() => onOpenDiary(diary.id)}>打开这篇日记</button></article>)}</div>
    </> : `${year}-${String(month).padStart(2,'0')}-01` > todayKey ? <div className="detail-empty"><h2>未来的日子，等到了再记录。</h2><p>日记只能记录今天或过去的日期。</p></div> : <div className="detail-empty"><h2>这一天，还没有确认过的心情。</h2><p>未确认或跳过标记的日记，仍可在日记列表里查看。</p><button className="primary-button" onClick={onWrite}>写一篇日记</button></div>}</section>
  </div></div>
}
