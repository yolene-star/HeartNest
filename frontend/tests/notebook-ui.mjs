import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8080'
const output = new URL('../../docs/design/notebook-validation/', import.meta.url)
await fs.mkdir(output, { recursive: true })
const snapshot = async () => Object.fromEntries(await Promise.all(['diaries', 'profile'].map(async name => [name, await (await fetch(`${base}/api/${name}`)).json()])))
const before = await snapshot()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
async function clickable(locator) {
  await locator.scrollIntoViewIfNeeded()
  assert(await locator.evaluate(el => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === el }), 'Decoration must not obscure controls')
}
try {
  await page.goto(base)
  await page.locator('.notebook-shell').waitFor({ timeout: 5000 })
  for (const width of [390, 785, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const [index, name] of ['陪伴', '日记', '回顾', '我的'].entries()) {
      const nav = page.getByRole('button', { name, exact: true })
      await clickable(nav)
      await nav.click()
      assert.equal(await nav.getAttribute('aria-current'), 'page')
      await page.locator('main h1').waitFor()
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${name}: horizontal overflow`)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: fileURLToPath(new URL(`${width}-${index + 1}.png`, output)), fullPage: true })
    }
    assert.equal(await page.locator('.notebook-binding').isVisible(), width > 650)
    if (width > 650) assert.equal(await page.locator('.notebook-binding i').count(), 5)
  }
  await page.getByRole('button', { name: '陪伴', exact: true }).click()
  await page.route('**/api/companion/respond', route => route.fulfill({ json: { reply: '那就先一起安静待会儿。', reply_source: 'rules', emotion_suggestion: { label: '平静' } } }))
  await page.locator('#chat-message').fill('手账界面虚构测试：我想安静待会儿。')
  await clickable(page.getByRole('button', { name: '发送', exact: true }))
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByTestId('assistant-reply').waitFor()
  await page.locator('.emotion-prompt summary').click()
  await page.getByRole('button', { name: '差不多', exact: true }).click()
  await page.getByRole('button', { name: '陪我待会儿', exact: true }).click()
  await page.getByTestId('quiet-scene').waitFor()
  assert(!(await page.locator('.notebook-binding').isVisible()))
  await page.getByRole('button', { name: '想聊聊', exact: true }).click()
  assert.equal(await page.getByTestId('assistant-reply').count(), 1)
  await page.getByRole('button', { name: '返回陪伴', exact: true }).click()
  assert(await page.locator('.notebook-binding').isVisible())
  assert.equal(await page.getByTestId('assistant-reply').count(), 1)
  assert.deepEqual(await snapshot(), before)
  assert.deepEqual(errors, [])
  await fs.writeFile(new URL('results.json', output), JSON.stringify({ passed: true, widths: [390, 785, 1440], pages: 4, checks: ['four page navigation', 'no horizontal overflow', 'unobscured controls', 'responsive binding', 'chat and mood confirmation', 'quiet scene round trip', 'stored data unchanged'], errors }, null, 2))
  console.log('PASS notebook UI: four pages at three widths, chat/mood/quiet round trip, original data unchanged')
} finally { await browser.close() }
