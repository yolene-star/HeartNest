import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const folder = new URL('../../docs/design/companion-scroll/', import.meta.url)
await fs.mkdir(folder, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage()
const base = 'http://127.0.0.1:8080'
const snapshot = async () => Promise.all(['diaries', 'profile'].map(async key => (await fetch(`${base}/api/${key}`)).json()))
const before = await snapshot()
const errors = []
page.on('pageerror', e => errors.push(e.message))
const positions = () => page.evaluate(() => ({ main: document.querySelector('.product-main').scrollTop, left: document.querySelector('.conversation-scroll').scrollTop, right: document.querySelector('.companion-aside').scrollTop, window: scrollY }))
async function wheel(selector, delta) {
  const box = await page.locator(selector).boundingBox()
  await page.mouse.move(box.x + box.width / 2, Math.max(60, box.y + 80))
  await page.mouse.wheel(0, delta)
  await page.waitForTimeout(450)
}
try {
  for (const height of [871, 650]) {
    await page.setViewportSize({ width: 1363, height })
    await page.goto(base)
    await page.locator('.conversation-panel').waitFor()
    await page.locator('.companion-aside').evaluate(el => { const section = document.createElement('section'); section.className = 'aside-section'; section.style.minHeight = '1300px'; section.textContent = '虚构长内容：独立滚动验收'; el.prepend(section) })
    // Browser-only long conversation fixture; never sent to the API or saved.
    await page.locator('.conversation-scroll').evaluate(el => {
      el.replaceChildren(...Array.from({ length: 30 }, (_, i) => {
        const p = document.createElement('p'); p.textContent = `虚构滚动验收 ${i + 1}：今天想慢慢走一会儿，给自己留一点空间。`; return p
      }))
    })
    // Let the initial chat auto-scroll settle before measuring unrelated wheel movement.
    await page.waitForTimeout(500)
    const start = await positions()
    await wheel('.companion-aside', 380)
    const right = await positions()
    assert(right.right > 0, 'Right suggestions must have their own scroll container')
    assert.equal(right.main, start.main, 'Right scrolling must not move the outer paper')
    assert.equal(right.left, start.left, 'Right scrolling must not move the conversation')
    await wheel('.conversation-scroll', 350)
    const left = await positions()
    assert(left.left > 0)
    assert.equal(left.right, right.right)
    assert.equal(left.main, right.main)
    for (const selector of ['.companion-aside', '.conversation-scroll']) {
      await page.locator(selector).evaluate(el => { el.scrollTop = el.scrollHeight })
      const edge = await positions()
      await wheel(selector, 600)
      assert.deepEqual(await positions(), edge, 'Scrolling at either bottom must not chain to another pane')
    }
    assert(await page.locator('.composer').evaluate(el => {
      const r = el.getBoundingClientRect(), main = document.querySelector('.product-main').getBoundingClientRect()
      return r.top >= main.top && r.bottom <= main.bottom
    }), 'Composer remains visible while conversation scrolls')
    await page.screenshot({ path: fileURLToPath(new URL(`1363-${height}.png`, folder)) })
  }
  for (const width of [781, 390]) {
    await page.setViewportSize({ width, height: 871 })
    await page.goto(base)
    await page.locator('.conversation-panel').waitFor()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert.equal(await page.locator('.companion-aside').isVisible(), false, 'Narrow companion view reserves space for chat; diary stays accessible from navigation')
  }
  assert.deepEqual(await snapshot(), before)
  assert.deepEqual(errors, [])
  await fs.writeFile(new URL('results.json', folder), JSON.stringify({ passed: true, checks: ['independent actual wheel scrolling', 'no scroll chaining at bottom', 'composer visible', '871 and 650 tall desktops', 'narrow layouts prioritize chat without outer scrolling', 'default data unchanged'], errors }, null, 2))
  console.log('PASS companion independent scrolling, edges, composer, short viewport, responsive, data preserved')
} finally { await browser.close() }
