import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base = 'http://127.0.0.1:8080'
const out = '../docs/design/notebook-layout'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
const frames = () => page.evaluate(() => {
  const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
  return { top: rect('.nature-topline'), bottom: rect('.notebook-page-footer'), main: document.querySelector('.product-main').scrollTop, window: scrollY }
})
try {
  for (const [width, height] of [[1363,871],[1363,650],[781,871],[390,871]]) {
    await page.setViewportSize({ width, height })
    await page.goto(base)
    await page.locator('.conversation-panel').waitFor()
    assert.equal(await page.locator('.notebook-page-content').count(), 1, 'Page needs a bounded content region separate from its stationery header/footer')
    for (const name of ['陪伴','日记','回顾','我的']) {
      await page.getByRole('button', { name, exact: true }).click()
      const before = await frames()
      assert(before.top.y >= 0 && before.bottom.y + before.bottom.height <= height - (width <= 650 ? 65 : 0), 'Stationery header and footer must fit the viewport')
      const content = page.locator('.notebook-page-content')
      const box = await content.boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.wheel(0, 900)
      await page.waitForTimeout(300)
      assert.deepEqual(await frames(), before, 'Outer paper/header/footer must not move')
      if (name === '陪伴') {
        assert.equal(await content.evaluate(el => el.scrollTop), 0)
        assert(await page.locator('.conversation-scroll').evaluate(el => el.clientHeight >= 55), 'Messages need usable height')
        assert(await page.locator('.composer').evaluate(el => {
          const r = el.getBoundingClientRect(), bounds = document.querySelector('.notebook-page-content').getBoundingClientRect()
          return r.top >= bounds.top && r.bottom <= bounds.bottom + 1
        }), 'Entire composer must fit without outer scrolling')
      } else if (name === '我的') {
        assert(await content.evaluate(el => el.scrollTop > 0), 'Long page content must remain reachable')
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.screenshot({ path: `${out}/${width}-${height}-${name}.png` })
    }
  }
  await page.getByRole('button', { name: '陪伴', exact: true }).click()
  await page.getByRole('button', { name: '陪我待会儿', exact: true }).click()
  await page.getByTestId('quiet-scene').waitFor()
  await page.getByRole('button', { name: '返回陪伴', exact: true }).click()
  await page.locator('.composer').waitFor()
  assert.deepEqual(errors, [])
  await fs.writeFile(`${out}/results.json`, JSON.stringify({ passed: true, checks: ['four viewport sizes, all four pages', 'fixed stationery header/footer', 'companion fits without outer scrolling', 'composer fully visible', 'long settings content reachable', 'quiet scene return'], errors }, null, 2))
  console.log('PASS fixed notebook page chrome, companion fit, four pages/four viewports, quiet return')
} finally { await browser.close() }
