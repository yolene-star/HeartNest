// Capture nested scroll events as they do not bubble. Keep a stable scrollbar
// footprint so showing its thumb never shifts the notebook layout.
export function installScrollbars() {
  const timers = new Map()
  const onScroll = event => {
    const element = event.target === document ? document.documentElement : event.target
    if (!(element instanceof Element)) return
    element.classList.add('is-scrolling')
    clearTimeout(timers.get(element))
    timers.set(element, setTimeout(() => {
      element.classList.remove('is-scrolling')
      timers.delete(element)
    }, 900))
  }
  document.addEventListener('scroll', onScroll, { capture: true, passive: true })
  return () => {
    document.removeEventListener('scroll', onScroll, true)
    for (const [element, timer] of timers) {
      clearTimeout(timer)
      element.classList.remove('is-scrolling')
    }
    timers.clear()
  }
}
