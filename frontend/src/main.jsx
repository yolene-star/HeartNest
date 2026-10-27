import React, {useEffect, useState} from 'react'
import {createRoot} from 'react-dom/client'
import './styles.css'

const API='/api'
async function request(path, options={}){ const r=await fetch(API+path,{headers:{'Content-Type':'application/json'},...options}); if(!r.ok) throw new Error(await r.text()); return r.json() }

function App(){
  const [tab,setTab]=useState('记录')
  const [text,setText]=useState('')
  const [kind,setKind]=useState('diary')
  const [mode,setMode]=useState('respond')
  const [emotion,setEmotion]=useState(null)
  const [diaries,setDiaries]=useState([])
  const [query,setQuery]=useState('')
  const [memories,setMemories]=useState([])
  const [profiles,setProfiles]=useState([])
  const [recs,setRecs]=useState([])
  const [memoryEnabled,setMemoryEnabled]=useState(true)
  const [notice,setNotice]=useState('')
  const [budget,setBudget]=useState(100)
  const refresh=async()=>{ const [d,p,s]=await Promise.all([request('/diaries'),request('/profile'),request('/settings')]); setDiaries(d.items);setProfiles(p.items);setMemoryEnabled(s.memory_enabled) }
  useEffect(()=>{refresh().catch(e=>setNotice(e.message))},[])
  const save=async()=>{ if(!text.trim()) return; const item=await request('/diaries',{method:'POST',body:JSON.stringify({kind,text,mode,allow_retrieval:memoryEnabled})}); setEmotion(item.emotion);setText('');setNotice('已保存记录');refresh() }
  const search=async()=>{ const r=await request('/memories/search',{method:'POST',body:JSON.stringify({query,top_k:5})});setMemories(r.items);setNotice(r.memory_enabled?'已检索历史记录':'记忆调用已关闭') }
  const recommend=async()=>{ const r=await request('/recommendations',{method:'POST',body:JSON.stringify({query,budget,time:'周末'})});setRecs(r.items);setNotice('已生成候选建议') }
  const toggleMemory=async()=>{const r=await request('/settings',{method:'PATCH',body:JSON.stringify({memory_enabled:!memoryEnabled})});setMemoryEnabled(r.memory_enabled);setNotice(r.memory_enabled?'已开启记忆调用':'已关闭记忆调用')}
  const updateEmotion=async(id,label)=>{await request(`/diaries/${id}/emotion`,{method:'PATCH',body:JSON.stringify({label})});refresh();setNotice('情绪标签已修正')}
  const deleteDiary=async(id)=>{await request(`/diaries/${id}`,{method:'DELETE'});refresh();setNotice('记录已删除')}
  const deleteProfile=async(id)=>{await request(`/profile/${id}`,{method:'DELETE'});refresh();setNotice('画像条目已删除')}
  const feedback=async(id,action)=>{await request('/feedback',{method:'POST',body:JSON.stringify({recommendation_id:id,action})});refresh();setNotice(action==='reject'?'已记录拒绝偏好':'已记录接受反馈')}
  return <div className="app"><header><div><span className="eyebrow">DAILY COMPANION / 01</span><h1>心语</h1><p>把今天的感受，交给一个记得住的陪伴入口。</p></div><button className={memoryEnabled?'pill on':'pill'} onClick={toggleMemory}>记忆调用 {memoryEnabled?'开启':'关闭'}</button></header>
    <nav>{['记录','历史记忆','兴趣画像','活动建议'].map(x=><button className={tab===x?'active':''} onClick={()=>setTab(x)} key={x}>{x}</button>)}</nav>
    {notice&&<div className="notice">{notice}</div>}
    {tab==='记录'&&<main className="grid"><section className="card hero"><span className="eyebrow">表达入口</span><h2>此刻，想留下些什么？</h2><div className="switch"><button className={kind==='diary'?'selected':''} onClick={()=>setKind('diary')}>独立日记</button><button className={kind==='chat'?'selected':''} onClick={()=>setKind('chat')}>聊天记录</button></div><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="写下今天的情绪、经历，或一个突然想到的兴趣…"/><div className="row"><select value={mode} onChange={e=>setMode(e.target.value)}><option value="respond">保存并获得回应</option><option value="save">仅保存</option></select><button className="primary" onClick={save}>保存这段记录 →</button></div>{emotion&&<div className="emotion"><strong>情绪初判：{emotion.label}</strong><span>置信度 {Math.round(emotion.confidence*100)}%</span><div className="row compact">{['积极','平稳','低落','焦虑'].map(x=><button key={x} onClick={()=>diaries[0]&&updateEmotion(diaries[0].id,x)}>{x}</button>)}</div></div>}</section><section className="card"><div className="card-head"><span className="eyebrow">最近记录</span><span>{diaries.length} 条</span></div>{diaries.slice(0,4).map(d=><article className="diary" key={d.id}><div><span className="tag">{d.emotion.label}</span><span className="date">{d.recorded_at.slice(0,10)}</span></div><p>{d.text}</p><button className="link" onClick={()=>deleteDiary(d.id)}>删除</button></article>)}{!diaries.length&&<p className="muted">还没有记录，从左侧写下第一段吧。</p>}</section></main>}
    {tab==='历史记忆'&&<main className="two-col"><section className="card"><span className="eyebrow">长期记忆检索</span><h2>你想找回哪段经历？</h2><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="例如：甜品店、上周的展览…"/><button className="primary full" onClick={search}>检索相关记录</button></section><section className="card"><span className="eyebrow">引用结果</span>{memories.map(m=><article className="memory" key={m.id}><div><span className="tag">相关度 {m.score}</span><span className="date">{m.recorded_at.slice(0,10)}</span></div><p>{m.text}</p></article>)}{!memories.length&&<p className="muted">输入关键词后，系统会展示可核查的原文和日期。</p>}</section></main>}
    {tab==='兴趣画像'&&<main className="two-col"><section className="card"><span className="eyebrow">画像管理</span><h2>明确表达，才会被记住。</h2><p className="muted">系统只记录你确认过的喜欢、反感和待体验内容。</p>{profiles.map(p=><article className="profile" key={p.id}><div><strong>{p.content}</strong><span className="tag">{p.type}</span><span className="date">{p.status}</span></div><button className="link" onClick={()=>deleteProfile(p.id)}>删除</button></article>)}{!profiles.length&&<p className="muted">暂无画像条目。</p>}</section><section className="card note"><span className="eyebrow">控制权</span><h3>你可以随时修正或删除</h3><p>历史记录、情绪标签和兴趣画像都保留来源与时间，方便追溯。关闭记忆调用后，系统不会引用历史日记。</p></section></main>}
    {tab==='活动建议'&&<main className="two-col"><section className="card"><span className="eyebrow">按需推荐</span><h2>给自己安排一点轻松的事。</h2><textarea value={query} onChange={e=>setQuery(e.target.value)} placeholder="现在想做什么？"/><label>预算上限：{budget} 元<input type="range" min="0" max="300" value={budget} onChange={e=>setBudget(Number(e.target.value))}/></label><button className="primary full" onClick={recommend}>生成候选建议</button></section><section className="card"><span className="eyebrow">候选活动</span>{recs.map(a=><article className="recommend" key={a.id}><div><h3>{a.name}</h3><span className="tag">{a.type} · {a.cost}元</span></div><p>{a.description}</p><div className="row"><button className="secondary" onClick={()=>feedback(a.id,'accept')}>愿意尝试</button><button className="link" onClick={()=>feedback(a.id,'reject')}>暂时不想</button></div></article>)}{!recs.length&&<p className="muted">输入当前诉求后生成建议，系统会尊重你的预算和反馈。</p>}</section></main>}
  </div>
}
createRoot(document.getElementById('root')).render(<App />)
