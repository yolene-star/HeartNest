import React, { useEffect, useRef } from 'react'
import './relaxation.css'

export default function RelaxationChoice({ onDismiss, onLake, onPractice, onChat, busy }) {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    const previousFocus = document.activeElement
    element.showModal()
    return () => {
      element.close()
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={dialog} className="relaxation-dialog" aria-labelledby="relaxation-title" onCancel={event => { event.preventDefault(); onDismiss() }}>
    <p className="eyebrow">给自己一点空隙</p>
    <h2 id="relaxation-title">现在更想怎么缓一缓？</h2>
    <p>选一个舒服的方式就好，随时可以回来聊天。</p>
    <button className="relaxation-lake" onClick={onLake}><img src="/scenes/lakeside-watercolor.png" alt="" /><span><strong>去湖边坐坐</strong><small>不用做什么，让小伙伴陪你待会儿</small></span></button>
    <button className="relaxation-practice" onClick={onPractice} disabled={busy}><strong>试个小办法</strong><small>看看有依据的轻练习，适不适合由你决定</small></button>
    <button className="secondary-button" onClick={onChat}>继续聊聊</button>
    <button className="text-link" onClick={onDismiss}>暂时不选</button>
  </dialog>
}
