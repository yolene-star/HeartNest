import React from 'react'
import { MoodFace, normalizeEmotion } from './NatureUI.jsx'

const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export default function MoodTimeline({ timeline, onOpenDiary }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - 6 + index)
    const key = dateKey(date)
    const labels = new Map()
    for (const row of timeline.filter(item => item.date === key)) {
      const label = normalizeEmotion(row.label)
      if (!labels.has(label)) labels.set(label, [])
      labels.get(label).push(row.diary_id)
    }
    return { key, short: `${date.getMonth() + 1}/${date.getDate()}`, labels }
  })
  return <section className="mood-time-chart" data-testid="mood-timeline" aria-label="最近七天情绪时间图">
    <h2>把这几天连起来看看</h2><p>只显示你确认过的标签；表情旁的数字是记录条数，空白日不推断心情。</p>
    <div className="mood-time-grid">{days.map(day => <div key={day.key} className="mood-time-day">
      <time dateTime={day.key}>{day.short}</time>
      {day.labels.size ? [...day.labels].map(([label, ids]) => <button key={label} title={`${day.key} · ${label} · ${ids.length} 条`} aria-label={`${day.key} ${label} ${ids.length} 条，打开记录`} onClick={() => onOpenDiary(ids[0])}>
        <MoodFace label={label} small /><span>{label}</span><small>{ids.length} 条</small>
      </button>) : <span className="mood-time-empty">未记录</span>}
    </div>)}</div><p className="mood-time-note">不同情绪没有高低分；同一天可以同时有多种感受。</p>
  </section>
}
