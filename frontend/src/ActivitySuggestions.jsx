import React, { useState } from 'react'

const json = body => ({ method: 'POST', body: JSON.stringify(body) })

export default function ActivitySuggestions({ request, onRefresh }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [budget, setBudget] = useState('')
  const [time, setTime] = useState('')
  const [items, setItems] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const search = async event => {
    event.preventDefault(); setBusy(true); setError('')
    try { setItems((await request('/recommendations', json({ query, budget: budget === '' ? null : Number(budget), time: time || null }))).items) }
    catch { setError('活动暂时没有找到，请重试。') }
    finally { setBusy(false) }
  }
  return <section className="aside-section activity-suggestions">
    <button className="secondary-button" aria-expanded={open} onClick={() => setOpen(value => !value)}>一起找个小活动</button>
    {open && <><p>按你确认过的偏好挑选。这里是模拟活动，时间、地点和费用供原型演示。</p>
      <form onSubmit={search} className="activity-filter">
        <label>现在想做什么<input className="text-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="例如：安静地放松一下" /></label>
        <label>活动预算（元）<input className="text-input" type="number" min="0" step="any" value={budget} onChange={e => setBudget(e.target.value)} placeholder="不限" /></label>
        <label>活动时间<select className="select-input" value={time} onChange={e => setTime(e.target.value)}><option value="">不限</option><option>今晚</option><option>下午</option><option>周末</option></select></label>
        <button className="primary-button" disabled={busy}>{busy ? '正在筛选…' : '筛选活动'}</button>
      </form>
      {error && <p role="alert" className="inline-error">{error}</p>}
      {items?.length === 0 && <p role="status">暂时没有符合条件的活动。</p>}
      {items?.map(item => <ActivityCard key={item.id} activity={item} request={request} onRefresh={onRefresh} onModify={() => { setItems(null); setQuery(item.type); setError('可以调整时间、预算或诉求，再筛选一次。') }} />)}
    </>}
  </section>
}

function ActivityCard({ activity, request, onRefresh, onModify }) {
  const [remember, setRemember] = useState(false)
  const [experience, setExperience] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const feedback = async action => {
    setBusy(true); setNotice('')
    try {
      await request('/feedback', json({ recommendation_id: activity.id, action, experience, remember_preference: action === 'modify' ? false : remember }))
      await onRefresh()
      setNotice(remember && action !== 'modify' ? '已按你的确认更新偏好，可到“我的”修改或删除。' : '只记下这次选择，不会改变长期偏好。')
      if (action === 'modify') onModify()
    } catch { setNotice('反馈没有保存，请重试。') }
    finally { setBusy(false) }
  }
  return <article className="activity-card" data-testid="activity-card"><h3>{activity.name}</h3>
    <p>{activity.description}</p><p>{activity.time} · {activity.cost} 元 · {activity.location || '地点自选'}</p>
    <ul>{activity.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    <label className="activity-consent"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />将这次选择记为长期偏好</label>
    {remember && <p className="preference-explanation">愿意尝试 → 想尝试；做过了 → 已体验；这次不想 → 不再推荐“{activity.type}”类。随时可在“我的”更改。</p>}
    <label>体验补充（可选）<textarea value={experience} onChange={e => setExperience(e.target.value)} /></label>
    <div className="advice-actions">{[['accept', '愿意尝试'], ['reject', '这次不想'], ['modify', '调整条件'], ['experienced', '做过了']].map(([action, label]) => <button className="text-link" key={action} disabled={busy} onClick={() => feedback(action)}>{label}</button>)}</div>
    {notice && <p role="status">{notice}</p>}<small>{activity.source}</small>
  </article>
}
